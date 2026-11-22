import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import yaml

SCRIPT = Path(__file__).resolve().parents[1] / 'scripts/dependency-targets.py'
loader = importlib.util.spec_from_file_location('dependency_targets', SCRIPT)
targets = importlib.util.module_from_spec(loader)
loader.loader.exec_module(targets)


class DependencyTargetTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        for path, text in {
            'apps/one/ui/package.json': '{}',
            'apps/one/ui/nested/package.json': '{}',
            'apps/two/ui/package.json': '{}',
            'apps/one/python/uv.lock': 'version = 1',
            'apps/one/python/pyproject.toml': '[tool.uv.workspace]\nmembers = ["backend", "workflows/*"]\n',
            'apps/one/python/backend/pyproject.toml': '[project]\nname="backend"',
            'apps/one/python/backend/uv.lock': 'version = 1',
            'apps/one/python/workflows/worker/pyproject.toml': '[project]\nname="worker"',
            'apps/two/python/uv.lock': 'version = 1',
            'apps/two/python/pyproject.toml': '[project]\nname="other"',
            'apps/one/go/shared/go.mod': 'module example/shared\n',
            'apps/one/go/web/go.mod': 'module example/web\nreplace example/shared => ../shared\n',
            'apps/two/go/go.mod': 'module example/other\n',
            'apps/one/sandbox-samples/example/package.json': '{}',
            'apps/one/sandbox-template/package.json': '{}',
            'apps/one/ui/node_modules/fixture/package.json': '{}',
        }.items():
            file = self.root / path
            file.parent.mkdir(parents=True, exist_ok=True)
            file.write_text(text)
        manifest = self.root / 'deploy/reinvent-2026.yaml'
        manifest.parent.mkdir(parents=True)
        manifest.write_text(yaml.safe_dump({'spec': {'builds': {
            'one': {'context':'apps/one','dockerfile':'apps/one/Dockerfile'},
            'two': {'context':'apps/two','dockerfile':'apps/two/Dockerfile'},
        }}}))

    def select(self, *paths):
        return targets.select_targets(self.root, list(paths))

    def test_nested_npm_source_and_lock_select_only_nearest_project(self):
        result = self.select('apps/one/ui/nested/src/worker.ts', 'apps/one/ui/nested/package-lock.json')
        self.assertEqual(result['npm'], ['apps/one/ui/nested'])
        self.assertEqual([build['name'] for build in result['builds']], ['one'])
        self.assertEqual(result['go'], [])
        self.assertEqual(result['python'], [])

    def test_python_nested_workspace_lock_and_source_collapse_to_root(self):
        result = self.select('apps/one/python/backend/uv.lock','apps/one/python/workflows/worker/src/worker.py')
        self.assertEqual(result['python'], ['apps/one/python'])
        self.assertEqual(result['npm'], [])

    def test_go_shared_change_includes_local_module_consumers(self):
        result = self.select('apps/one/go/shared/activity.go')
        self.assertEqual(result['go'], ['apps/one/go/shared','apps/one/go/web'])
        web_only = self.select('apps/one/go/web/main.go')
        self.assertEqual(web_only['go'], ['apps/one/go/web'])

    def test_fixture_npm_projects_and_generated_files_are_excluded(self):
        result = self.select('apps/one/sandbox-samples/example/package-lock.json','apps/one/sandbox-template/index.js','apps/one/ui/node_modules/fixture/index.js')
        self.assertEqual(result['npm'], [])
        self.assertEqual([build['name'] for build in result['builds']], ['one'])

    def test_unknown_and_outside_paths_are_safe(self):
        empty = {'npm':[],'go':[],'python':[],'builds':[]}
        self.assertEqual(self.select('unknown/file.xyz','../outside/package.json',''), empty)
        self.assertEqual(self.select('README.md'), empty)

    def test_deployment_changes_select_all_declared_builds(self):
        result = self.select('deploy/reinvent-2026.yaml')
        self.assertEqual([build['name'] for build in result['builds']], ['one','two'])
        self.assertEqual(result['builds'][0], {'name':'one','context':'apps/one','dockerfile':'apps/one/Dockerfile'})

    def test_cli_outputs_json(self):
        result = subprocess.run([sys.executable,str(SCRIPT),'--root',str(self.root),'apps/two/ui/src/App.tsx'],capture_output=True,text=True,check=True)
        self.assertEqual(json.loads(result.stdout)['npm'], ['apps/two/ui'])

    def test_git_diff_mode_uses_exact_revisions(self):
        def git(*args):
            return subprocess.run(['git','-C',str(self.root),*args],capture_output=True,text=True,check=True).stdout.strip()
        git('init','-q')
        git('config','user.name','Fixture')
        git('config','user.email','fixture@example.invalid')
        git('add','.')
        git('commit','-qm','Initial fixture')
        base = git('rev-parse','HEAD')
        source = self.root/'apps/two/ui/src/App.tsx'
        source.parent.mkdir()
        source.write_text('export const version = 2')
        git('add','.')
        git('commit','-qm','Change app')
        result = subprocess.run([sys.executable,str(SCRIPT),'--root',str(self.root),'--base',base,'--head','HEAD'],capture_output=True,text=True,check=True)
        self.assertEqual(json.loads(result.stdout)['npm'], ['apps/two/ui'])

    def test_git_revisions_cannot_inject_command_options(self):
        result = subprocess.run([sys.executable,str(SCRIPT),'--root',str(self.root),'--base=--output=unwanted.txt'],capture_output=True,text=True)
        self.assertEqual(result.returncode,2)
        self.assertIn('must not start with an option prefix',result.stderr)
        self.assertFalse((self.root/'unwanted.txt').exists())

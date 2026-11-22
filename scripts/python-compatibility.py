"""Install locked Python dependencies, then run provider-free compatibility checks."""
import argparse
import compileall
from pathlib import Path
import re
import subprocess
import tomllib

parser=argparse.ArgumentParser()
parser.add_argument('phase',choices=['prepare','test'])
args=parser.parse_args()
root=Path.cwd()
if args.phase=='prepare':
    manifest=tomllib.loads((root/'pyproject.toml').read_text())
    command=['uv','sync','--frozen','--all-packages','--all-extras']
    command += ['--group','dev'] if 'dev' in manifest.get('dependency-groups',{}) else ['--no-dev']
    subprocess.run(command,check=True)
else:
    subprocess.run(['uv','pip','check'],check=True)
    if not compileall.compile_dir(root,quiet=1,rx=re.compile(r'/(?:\.venv|node_modules|\.git|dist|tmp)/')):
        raise SystemExit('Application source compilation failed')
    # These suites mock their I/O or use synthetic models. Workflow/server/provider
    # integration suites are deliberately separate; never download or call providers here.
    candidates=['backend/tests','tests/test_email.py','tests/test_temporal_ui_url.py',
                'tests/test_temporal_durability.py','tests/test_reinvent_cloud.py']
    tests=[path for path in candidates if (root/path).exists()]
    tests += [str(path.relative_to(root)) for path in (root/'tests').glob('test_compatibility*.py')]
    for path in ['docker/check-model-config.py','docker/check-local.py']:
        if (root/path).is_file():
            subprocess.run(['uv','run','--no-sync','python',path],check=True)
    if tests:
        has_pytest=subprocess.run(['uv','run','--no-sync','python','-c',"import importlib.util; raise SystemExit(0 if importlib.util.find_spec('pytest') else 1)"]).returncode==0
        if has_pytest:
            subprocess.run(['uv','run','--no-sync','python','-m','pytest','-q',*tests],check=True)
        else:
            # Small projects can use stdlib unittest without adding a test-only runtime dependency.
            subprocess.run(['uv','run','--no-sync','python','-c',"import unittest; suite=unittest.defaultTestLoader.discover('tests',pattern='test_compatibility*.py'); assert suite.countTestCases()>0, 'No unittest compatibility cases discovered'; result=unittest.TextTestRunner(verbosity=2).run(suite); raise SystemExit(not result.wasSuccessful())"],check=True)
    else:
        print('Package consistency and source compilation passed; no provider-free suite selected.')

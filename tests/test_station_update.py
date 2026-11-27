"""Exercise booth updates against real local Git repos without touching macOS services."""
import fcntl
import importlib.util
import json
import os
from pathlib import Path
import shlex
import subprocess
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('station_update', ROOT/'scripts/setup/update_mac_station.py')
updater = importlib.util.module_from_spec(spec)
spec.loader.exec_module(updater)


class StationUpdateTests(unittest.TestCase):
    def setUp(self):
        (ROOT/'tmp').mkdir(exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(dir=ROOT/'tmp')
        self.addCleanup(self.temp.cleanup)
        self.folder = Path(self.temp.name)
        self.remote = self.folder/'remote.git'
        self.seed = self.folder/'seed'
        self.repo = self.folder/"booth's clone"
        self.git(self.folder, 'init', '--bare', '--initial-branch=main', str(self.remote))
        self.git(self.folder, 'clone', str(self.remote), str(self.seed))
        self.git(self.seed, 'config', 'user.name', 'Booth setup test')
        self.git(self.seed, 'config', 'user.email', 'booth-test@example.invalid')
        (self.seed/'scripts').mkdir()
        (self.seed/'scripts/local.sh').write_text('#!/bin/bash\nmkdir -p tmp\nprintf "%s\\n" "$@" > tmp/startup-args\n')
        (self.seed/'.gitignore').write_text('tmp/\n.env\n')
        (self.seed/'version.txt').write_text('first')
        self.git(self.seed, 'add', '.')
        self.git(self.seed, 'commit', '-m', 'Initial test fixture')
        self.git(self.seed, 'push', 'origin', 'main')
        self.git(self.folder, 'clone', str(self.remote), str(self.repo))
        self.support = self.folder/'Application Support'
        self.support.mkdir()
        self.config = self.support/'config.json'
        self.config.write_text(json.dumps(dict(station='3',repo=str(self.repo),support=str(self.support),
            docker='/fake/docker',hosted='https://example.invalid',local='http://127.0.0.1:15101',
            listen='127.0.0.1:15103',key='ab'*32)))
        self.recoveries = []
        self.addCleanup(patch.stopall)
        patch.object(updater, 'SOURCE_URLS', {str(self.remote)}).start()

    def git(self, root, *args):
        return subprocess.run(['git', *args], cwd=root, capture_output=True, text=True, check=True).stdout.strip()

    def runner(self, args, **kwargs):
        if args[0] == '/bin/launchctl':
            self.recoveries.append(args)
            return subprocess.CompletedProcess(args, 0)
        return subprocess.run(args, **kwargs)

    def advance(self):
        (self.seed/'version.txt').write_text('second')
        self.git(self.seed, 'commit', '-am', 'Update test fixture')
        self.git(self.seed, 'push', 'origin', 'main')
        return self.git(self.seed, 'rev-parse', 'HEAD')

    def status(self):
        return json.loads((self.support/'update-status.json').read_text())

    def test_fast_forward_restarts_exact_station_and_preserves_local_data(self):
        revision = self.advance()
        (self.repo/'.env').write_text('ROLE=booth\nBOOTH=3\n')
        (self.repo/'tmp').mkdir()
        (self.repo/'tmp/pairing.json').write_text('retain pairing')
        self.assertEqual(updater.update(self.config, self.runner), 0)
        self.assertEqual(self.git(self.repo, 'rev-parse', 'HEAD'), revision)
        args = (self.repo/'tmp/startup-args').read_text().splitlines()
        self.assertEqual(args[:5], ['booth','--station','3','--pairing-file',str(self.config)])
        self.assertEqual((self.repo/'tmp/pairing.json').read_text(), 'retain pairing')
        self.assertEqual((self.repo/'.env').read_text(), 'ROLE=booth\nBOOTH=3\n')
        self.assertEqual(self.status()['update_state'], 'complete')
        self.assertEqual(self.status()['update_revision'], revision)
        self.assertEqual(self.recoveries, [])

    def test_dirty_tracked_files_are_not_overwritten(self):
        self.advance()
        (self.repo/'version.txt').write_text('staff edit')
        self.assertEqual(updater.update(self.config, self.runner), 1)
        self.assertEqual((self.repo/'version.txt').read_text(), 'staff edit')
        self.assertIn('local edits', self.status()['update_message'])
        self.assertEqual(len(self.recoveries), 1)
        self.assertFalse((self.repo/'tmp/startup-args').exists())

    def test_diverged_main_is_not_reset(self):
        self.advance()
        self.git(self.repo, 'config', 'user.name', 'Booth test')
        self.git(self.repo, 'config', 'user.email', 'booth-test@example.invalid')
        (self.repo/'local.txt').write_text('retain local commit')
        self.git(self.repo, 'add', 'local.txt')
        self.git(self.repo, 'commit', '-m', 'Keep local work')
        before = self.git(self.repo, 'rev-parse', 'HEAD')
        self.assertEqual(updater.update(self.config, self.runner), 1)
        self.assertEqual(self.git(self.repo, 'rev-parse', 'HEAD'), before)
        self.assertIn('no reset', self.status()['update_message'])

    def test_other_branch_is_not_switched(self):
        self.git(self.repo, 'switch', '-c', 'staff-work')
        self.assertEqual(updater.update(self.config, self.runner), 1)
        self.assertEqual(self.git(self.repo, 'branch', '--show-current'), 'staff-work')

    def test_unexpected_remote_is_refused(self):
        self.git(self.repo, 'remote', 'set-url', 'origin', '/unexpected/repo')
        self.assertEqual(updater.update(self.config, self.runner), 1)
        self.assertIn('expected public booth repository', self.status()['update_message'])

    def test_fetch_failure_recovers_without_building(self):
        self.remote.rename(self.folder/'offline.git')
        self.assertEqual(updater.update(self.config, self.runner), 1)
        self.assertEqual(self.recoveries[0][:3], ['/bin/launchctl','kickstart','-k'])
        self.assertFalse((self.repo/'tmp/startup-args').exists())
        self.assertEqual(self.status()['update_state'], 'failed')

    def test_build_failure_is_not_reported_as_a_completed_update(self):
        self.advance()
        def fail_build(args, **kwargs):
            if args[0] == '/bin/bash':
                raise subprocess.CalledProcessError(1, args)
            return self.runner(args, **kwargs)
        self.assertEqual(updater.update(self.config, fail_build), 1)
        self.assertEqual(self.status()['update_state'], 'failed')
        self.assertEqual(len(self.recoveries), 1)

    def test_duplicate_launch_does_not_start_another_update(self):
        with open(self.support/'update.lock', 'a') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX|fcntl.LOCK_NB)
            self.assertEqual(updater.update(self.config, self.runner), 0)
        self.assertFalse((self.support/'update-status.json').exists())
        self.assertEqual(self.recoveries, [])

    def test_generated_desktop_command_quotes_paths_and_contains_no_pairing_key(self):
        desktop = self.folder/"Desktop's icons"
        updater.install_launchers(self.config, desktop)
        launcher = desktop/updater.LAUNCHER
        text = launcher.read_text()
        parts = shlex.split(text.splitlines()[1])
        self.assertEqual(parts[0], 'exec')
        self.assertEqual(parts[-2:], ['--config',str(self.config)])
        self.assertNotIn('ab'*32, text)
        self.assertEqual(launcher.stat().st_mode & 0o777, 0o700)
        subprocess.run(['bash','-n',str(launcher)], check=True)
        self.assertEqual((self.support/updater.LAUNCHER).read_text(), text)

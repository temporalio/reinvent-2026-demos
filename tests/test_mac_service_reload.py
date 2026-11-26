"""Exercise launchd retries without changing login items or running Chrome."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
HELPER = ROOT / 'scripts/setup/reload-mac-service.sh'


class ServiceReloadTests(unittest.TestCase):
    def run_reload(self, scenario):
        with tempfile.TemporaryDirectory(dir=ROOT / 'tmp') as directory:
            folder = Path(directory)
            fake = folder / 'launchctl'
            fake.write_text('''#!/usr/bin/env python3
import os, sys
from pathlib import Path
root = Path(os.environ['FAKE_STATE'])
verb = sys.argv[1]
file = root / verb
count = int(file.read_text()) + 1 if file.exists() else 1
file.write_text(str(count))
scenario = os.environ['FAKE_SCENARIO']
if verb == 'print':
    sys.exit(0 if scenario == 'stuck' or (scenario == 'transient' and count < 3) else 113)
if verb == 'bootstrap':
    if scenario == 'invalid':
        print('invalid plist', file=sys.stderr)
        sys.exit(78)
    if scenario == 'persistent' or (scenario == 'transient' and count < 3):
        print('Bootstrap failed: 5: Input/output error', file=sys.stderr)
        sys.exit(5)
''')
            fake.chmod(0o700)
            sleeper = folder / 'sleep'
            sleeper.write_text('#!/bin/bash\nexit 0\n')
            sleeper.chmod(0o700)
            env = dict(os.environ, PATH=f'{folder}:{os.environ["PATH"]}',
                       FAKE_STATE=str(folder), FAKE_SCENARIO=scenario)
            result = subprocess.run(['bash', str(HELPER), 'gui/501',
                                     'io.temporal.reinvent-station', '/fake/station.plist'],
                                    env=env, text=True, capture_output=True, timeout=10)
            counts = {name: int((folder / name).read_text())
                      for name in ('print', 'bootstrap') if (folder / name).exists()}
            return result, counts

    def test_transient_unload_and_bootstrap_recover(self):
        result, counts = self.run_reload('transient')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(counts, {'print': 3, 'bootstrap': 3})

    def test_persistent_bootstrap_error_is_bounded_and_reported(self):
        result, counts = self.run_reload('persistent')
        self.assertEqual(result.returncode, 5)
        self.assertEqual(counts['bootstrap'], 8)
        self.assertIn('Bootstrap failed: 5', result.stderr)

    def test_stuck_unload_does_not_bootstrap(self):
        result, counts = self.run_reload('stuck')
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(counts, {'print': 10})
        self.assertIn('did not unload', result.stderr)

    def test_other_bootstrap_errors_are_not_retried(self):
        result, counts = self.run_reload('invalid')
        self.assertEqual(result.returncode, 78)
        self.assertEqual(counts['bootstrap'], 1)
        self.assertIn('invalid plist', result.stderr)

    def test_first_install_succeeds_immediately(self):
        result, counts = self.run_reload('new')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(counts, {'print': 1, 'bootstrap': 1})

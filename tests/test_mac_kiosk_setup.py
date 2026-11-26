"""Check kiosk installer validation without installing a login item or browser."""
from pathlib import Path
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[1]
INSTALLER = ROOT / 'scripts/setup/install-mac-kiosk.sh'
RUNNER = ROOT / 'scripts/setup/start-mac-kiosk.sh'
SUPERVISOR_INSTALLER = ROOT / 'scripts/setup/install-mac-station.sh'


class MacKioskSetupTests(unittest.TestCase):
    def run_installer(self, *args):
        return subprocess.run(['bash', str(INSTALLER), *args], capture_output=True, text=True, check=False)

    def test_shell_syntax(self):
        subprocess.run(['bash', '-n', str(INSTALLER), str(RUNNER), str(SUPERVISOR_INSTALLER)], check=True)

    def test_dry_run_preserves_profile_and_station(self):
        for station in ('1', '2', '3', '4'):
            result = self.run_installer('--station', station, '--dry-run')
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn('/?station='+station, result.stdout)
            self.assertIn('TemporalReinventKiosk/browser', result.stdout)
            self.assertIn('No files or login items changed.', result.stdout)
            self.assertNotIn('--incognito', RUNNER.read_text())

    def test_local_origin_and_repo_are_preserved(self):
        result = self.run_installer('--station', '2', '--url', 'http://localhost:15101/', '--local-repo', '/Users/booth/reinvent 2026', '--dry-run')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('http://localhost:15101/?station=2', result.stdout)
        self.assertIn('/Users/booth/reinvent 2026', result.stdout)

    def test_bad_station_origin_and_relative_repo_are_rejected(self):
        for args in [('--station','5'), ('--station','1','--url','https://user:pass@example.com'), ('--station','1','--url','https://example.com/?station=2'), ('--station','1','--local-repo','relative/path')]:
            with self.subTest(args=args):
                self.assertEqual(self.run_installer(*args, '--dry-run').returncode, 2)

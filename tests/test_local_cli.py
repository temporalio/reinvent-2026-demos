"""Exercise role selection without starting Docker, Chrome or login items."""
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
CLI = ROOT/'scripts/local.sh'


class LocalCliTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        (ROOT/'tmp').mkdir(exist_ok=True)

    def run_cli(self,*args):
        return subprocess.run(['bash',str(CLI),*args],capture_output=True,text=True,check=False)

    def pairing(self, directory, station='3'):
        path=Path(directory)/'station.json'
        path.write_text(json.dumps({'station':station,'hub':'http://192.168.50.10:15101','key':'a'*64}))
        return str(path)

    def test_help_describes_both_roles_without_setup(self):
        for args in [('--help',),('booth','--help'),('control','--help')]:
            r=self.run_cli(*args)
            self.assertEqual(r.returncode,0,r.stderr)
            self.assertIn('Control laptop:',r.stdout)
            self.assertIn('booth --station',r.stdout)
            self.assertNotIn('Collecting',r.stdout)

    def test_booth_requires_a_machine_number(self):
        r=self.run_cli('booth')
        self.assertEqual(r.returncode,2)
        self.assertIn('--station',r.stderr)

    def test_booth_explains_missing_pairing(self):
        r=self.run_cli('booth','--station','3')
        self.assertEqual(r.returncode,2)
        self.assertIn('pair --station 3',r.stderr)

    def test_pairing_cannot_be_used_for_another_station(self):
        with tempfile.TemporaryDirectory(dir=ROOT/'tmp') as d:
            r=self.run_cli('booth','--station','2','--pairing-file',self.pairing(d),'--dry-run')
        self.assertNotEqual(r.returncode,0)
        self.assertIn('different station',r.stderr)
        self.assertNotIn('Traceback',r.stderr)

    def test_numbered_booth_dry_run_does_not_prepare_or_install(self):
        with tempfile.TemporaryDirectory(dir=ROOT/'tmp') as d:
            r=self.run_cli('booth','--station','3','--pairing-file',self.pairing(d),'--test','--dry-run')
        self.assertEqual(r.returncode,0,r.stderr)
        self.assertIn('Station 3:',r.stdout)
        self.assertIn('No files or login items changed',r.stdout)
        self.assertNotIn('Building',r.stdout)

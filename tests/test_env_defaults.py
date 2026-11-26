"""Role defaults are data, never executable shell configuration."""
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('env_defaults',ROOT/'scripts/local/env_defaults.py')
env_defaults=importlib.util.module_from_spec(spec)
spec.loader.exec_module(env_defaults)


class EnvDefaultsTests(unittest.TestCase):
    def test_booth_defaults_launch_with_saved_key_and_explicit_override(self):
        (ROOT/'tmp').mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(dir=ROOT/'tmp') as directory:
            root=Path(directory)
            for file in ['scripts/local.sh','scripts/local/env_defaults.py','scripts/setup/install-mac-station.sh']:
                target=root/file;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(ROOT/file,target)
            (root/'.env').write_text('ROLE=booth\nCONTROL_IP=192.168.50.10\nBOOTH=3\n')
            config=root/'tmp/booth-config/station-3.json';config.parent.mkdir(parents=True)
            config.write_text(json.dumps({'station':'3','hub':'http://192.168.50.10:15101','key':'a'*64}))
            env={key:value for key,value in os.environ.items() if key not in ('ROLE','CONTROL_IP','BOOTH','BOOTH_ENV_LOADED')}
            result=subprocess.run(['bash',str(root/'scripts/local.sh'),'--test','--dry-run'],env=env,text=True,capture_output=True)
            self.assertEqual(result.returncode,0,result.stderr)
            self.assertIn('Station 3:',result.stdout)
            result=subprocess.run(['bash',str(root/'scripts/local.sh'),'booth','--station','2','--dry-run'],env=env,text=True,capture_output=True)
            self.assertEqual(result.returncode,2,result.stderr)
            self.assertIn('pair --station 2',result.stderr)

    def test_only_plain_known_settings_are_loaded(self):
        with tempfile.TemporaryDirectory(dir=ROOT/'tmp') as directory:
            path=Path(directory)/'.env'
            path.write_text('ROLE="booth"\nCONTROL_IP=192.168.1.2 # laptop\nBOOTH=3\nOPENAI_API_KEY=ignored\n')
            self.assertEqual(env_defaults.defaults(path),{'ROLE':'booth','CONTROL_IP':'192.168.1.2','BOOTH':'3'})
            path.write_text('ROLE=$(touch marker)\n')
            with self.assertRaises(ValueError):env_defaults.defaults(path)
            self.assertFalse((Path(directory)/'marker').exists())

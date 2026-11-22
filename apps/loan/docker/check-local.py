"""Exercise provider-free Loan routes inside its built image, without a provider."""
import json
import os
from pathlib import Path
import subprocess
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


def check():
    env = dict(os.environ)
    env.update({
        'LOAN_PROVIDER_MODE': 'unavailable',
        'TEMPORAL_ENV': 'local',
        'TEMPORAL_LOCAL_ADDRESS': 'unreachable.invalid:7233',
        'TEMPORAL_API_KEY': '',
        'AWS_EC2_METADATA_DISABLED': 'true',
    })
    process = subprocess.Popen([
        sys.executable, '-m', 'uvicorn', 'app:app', '--host', '127.0.0.1',
        '--port', '19080', '--root-path', '/loans',
    ], cwd=Path(__file__).resolve().parents[1], env=env, stdout=subprocess.DEVNULL)
    base = 'http://127.0.0.1:19080'
    try:
        for _ in range(60):
            if process.poll() is not None:
                raise RuntimeError('Loan web process exited during startup')
            try:
                with urlopen(base + '/api/runtime', timeout=2) as response:
                    runtime = json.load(response)
                break
            except (URLError, OSError):
                time.sleep(.5)
        else:
            raise RuntimeError('Loan web did not become ready')
        assert runtime['execution_available'] is False, runtime
        with urlopen(base + '/profiles', timeout=2) as response:
            profiles = json.load(response)
        assert profiles, 'Expected seed profiles'
        mutations = [
            ('/apply/' + profiles[0]['id'], {}),
            ('/apply/custom', {'name': 'Synthetic Preview', 'occupation': 'Tester', 'loan_amount': 1000, 'annual_income': 50000, 'loan_purpose': 'Local test'}),
            ('/apply/bulk', {'count': 1}),
            ('/decide/test', {'decision': 'approve'}),
            ('/decide-bulk', {'decision': 'approve', 'workflow_ids': ['test']}),
        ]
        for path, body in mutations:
            request = Request(base + path, data=json.dumps(body).encode(), headers={'Content-Type': 'application/json'})
            try:
                urlopen(request, timeout=3)
            except HTTPError as error:
                detail = json.load(error)
                assert error.code == 503 and detail['code'] == 'provider_unavailable', (path, error.code, detail)
            else:
                raise AssertionError('Unsupported local mutation succeeded: ' + path)
        print('Loan local preview passed: profiles available; all five mutations rejected without contacting Temporal or Bedrock.')
    finally:
        process.terminate()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()


if __name__ == '__main__':
    check()

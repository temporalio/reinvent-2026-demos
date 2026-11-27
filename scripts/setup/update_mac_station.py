#!/usr/bin/env python3
"""Update a prepared booth from main, retaining cached recovery and station data."""
import argparse
import fcntl
import json
import os
from pathlib import Path
import re
import shlex
import subprocess
import sys
import time
import uuid

SOURCE_URLS = {
    'https://github.com/temporalio/reinvent-2026-demos',
    'https://github.com/temporalio/reinvent-2026-demos.git',
    'git@github.com:temporalio/reinvent-2026-demos.git',
}
LAUNCHER = 'Update & Restart Booth.command'


class UpdateError(Exception):
    pass


def atomic(path, content, mode=0o600):
    path = Path(path)
    temporary = path.with_name(path.name + '.' + str(os.getpid()) + '.pending')
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, mode)
    with os.fdopen(fd, 'w') as stream:
        stream.write(content)
    os.chmod(temporary, mode)
    os.replace(temporary, path)


def load_config(path):
    config = json.loads(Path(path).read_text())
    if config.get('station') not in ('1', '2', '3', '4'):
        raise UpdateError('Use a paired booth station configuration.')
    for key in ('repo', 'support', 'docker'):
        if not isinstance(config.get(key), str) or not Path(config[key]).is_absolute():
            raise UpdateError('Station configuration needs absolute paths.')
    return config


def install_launchers(config_path, desktop=None):
    config_path = Path(config_path).resolve()
    config = load_config(config_path)
    support = Path(config['support'])
    desktop = Path(desktop) if desktop is not None else Path.home() / 'Desktop'
    desktop.mkdir(parents=True, exist_ok=True)
    helper = support / 'update_mac_station.py'
    atomic(helper, Path(__file__).read_text(), 0o700)
    content = '#!/bin/bash\nexec ' + ' '.join(shlex.quote(str(v)) for v in
        (sys.executable, helper, '--config', config_path)) + '\n'
    atomic(support / LAUNCHER, content, 0o700)
    atomic(desktop / LAUNCHER, content, 0o700)
    print('Installed desktop launcher:', desktop / LAUNCHER)


def update(config_path, run=subprocess.run):
    config = load_config(config_path)
    root, support = Path(config['repo']), Path(config['support'])
    support.mkdir(parents=True, exist_ok=True)
    lock = open(support / 'update.lock', 'a')
    os.chmod(support / 'update.lock', 0o600)
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        lock.close()
        print('This booth is already updating. Leave its Terminal window running.')
        return 0
    request_id = uuid.uuid4().hex
    try:
        pending = json.loads((support / 'update-request.json').read_text())
        if re.fullmatch('[a-f0-9]{32}', pending.get('id', '')):
            request_id = pending['id']
    except (OSError, ValueError, TypeError):
        pass
    revision = ''
    env = dict(os.environ, GIT_TERMINAL_PROMPT='0', GIT_SSH_COMMAND='ssh -oBatchMode=yes -oConnectTimeout=5')
    env['PATH'] = str(Path(config['docker']).parent) + os.pathsep + env.get('PATH', '')

    def status(state, message):
        atomic(support / 'update-status.json', json.dumps(dict(
            update_state=state, update_message=message, update_revision=revision,
            update_id=request_id, updated_at=int(time.time()))) + '\n')
        print(message, flush=True)

    def execute(args, timeout=90, capture=False):
        result = run(args, cwd=str(root), env=env, timeout=timeout, check=True,
                     **({'capture_output': True, 'text': True} if capture else {}))
        return result.stdout.strip() if capture else ''

    def git(*args):
        return execute(['git', *args], capture=True)

    try:
        status('updating', 'Checking this booth before updating main.')
        if git('symbolic-ref', '--quiet', '--short', 'HEAD') != 'main':
            raise UpdateError('Checkout is not on main; no branch was changed.')
        if git('remote', 'get-url', 'origin') not in SOURCE_URLS:
            raise UpdateError('Origin is not the expected public booth repository.')
        if git('status', '--porcelain', '--untracked-files=no'):
            raise UpdateError('Tracked files have local edits; nothing was overwritten.')
        status('updating', 'Fetching main from GitHub. The current booth keeps running.')
        git('fetch', '--no-tags', 'origin', 'main')
        try:
            git('merge-base', '--is-ancestor', 'HEAD', 'FETCH_HEAD')
        except subprocess.CalledProcessError as error:
            raise UpdateError('Local main has commits absent from GitHub; no reset was attempted.') from error
        git('merge', '--ff-only', 'FETCH_HEAD')
        revision = git('rev-parse', 'HEAD')
        status('updating', 'Building the local booth stack and restarting its kiosk.')
        execute(['/bin/bash', str(root / 'scripts/local.sh'), 'booth',
                 '--station', config['station'], '--pairing-file', str(Path(config_path).resolve()),
                 '--hosted', config['hosted'], '--local', config['local'], '--listen', config['listen']], timeout=1800)
        status('complete', 'Updated main and restarted the booth at ' + revision[:12] + '.')
        return 0
    except (UpdateError, OSError, subprocess.SubprocessError) as error:
        reason = str(error) if isinstance(error, UpdateError) else 'A GitHub, build or startup command failed; see this Terminal window.'
        status('updating', reason + ' Attempting the installed kiosk without a pull or build.')
        try:
            run(['/bin/launchctl', 'kickstart', '-k', f'gui/{os.getuid()}/io.temporal.reinvent-station'],
                timeout=30, check=True)
            status('failed', reason + ' Requested a cached kiosk restart; the update did not complete.')
        except (OSError, subprocess.SubprocessError):
            status('failed', reason + ' Installed kiosk restart also failed; staff attention is needed.')
        return 1
    finally:
        lock.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', required=True)
    parser.add_argument('--install', action='store_true')
    args = parser.parse_args()
    if args.install:
        install_launchers(args.config)
        return 0
    return update(args.config)


if __name__ == '__main__':
    raise SystemExit(main())

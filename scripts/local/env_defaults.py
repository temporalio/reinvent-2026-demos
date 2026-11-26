#!/usr/bin/env python3
"""Load a small, non-executable .env before dispatching the local launcher."""
import os
from pathlib import Path
import re
import sys

FIELDS = {'ROLE', 'CONTROL_IP', 'BOOTH'}


def defaults(path):
    result = {}
    if not path.exists():
        return result
    for number, line in enumerate(path.read_text().splitlines(), 1):
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        match = re.fullmatch(r'(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)', line)
        if not match:
            raise ValueError(f'.env line {number}: expected NAME=value')
        name, value = match.groups()
        if name not in FIELDS:
            continue
        if value[:1] in ('"', "'"):
            if len(value)<2 or value[-1]!=value[0]:
                raise ValueError(f'.env line {number}: unclosed quote')
            value = value[1:-1]
        else:
            value = re.split(r'\s+#', value, maxsplit=1)[0].strip()
        if not re.fullmatch(r'[A-Za-z0-9_.:/\[\]-]*', value):
            raise ValueError(f'.env line {number}: use a plain value for {name}')
        result[name] = value
    return result


def main():
    root = Path(__file__).resolve().parents[2]
    try:
        env = {**defaults(root/'.env'), **os.environ, 'BOOTH_ENV_LOADED':'1'}
    except (OSError, ValueError) as error:
        raise SystemExit(str(error))
    os.execve('/bin/bash', ['bash',str(root/'scripts/local.sh'), *sys.argv[1:]], env)


if __name__ == '__main__':
    main()

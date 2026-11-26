#!/usr/bin/env python3
"""Store Photo Booth email settings in the existing Fieldkit email secret.

Run interactively. Secret values stay in memory and reach AWS CLI through stdin,
never command arguments, files, Git, or terminal output. This updates an existing
secret; it does not create infrastructure or send an email.
"""
import argparse
import getpass
import json
import re
import subprocess
import sys


def update_email_secret(api_key, sender, *, secret_id, region, profile=None, run=subprocess.run):
    if not api_key.strip() or api_key.strip().lower() in {'todo', 'changeme', 'set-me'}:
        raise ValueError('A real SendGrid API key is required')
    if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', sender) or sender.lower().endswith('@example.com'):
        raise ValueError('Use a verified SendGrid sender address')
    command = ['aws', '--region', region]
    if profile:
        command += ['--profile', profile]
    previous = run(command + ['secretsmanager', 'get-secret-value', '--secret-id', secret_id, '--output', 'json'], capture_output=True, text=True, check=False)
    if previous.returncode:
        raise RuntimeError('Could not read the existing email secret; check AWS access and target')
    try:
        payload = json.loads(json.loads(previous.stdout)['SecretString'])
        if not isinstance(payload, dict):
            raise ValueError()
    except (ValueError, KeyError, TypeError):
        raise RuntimeError('Existing email secret must be a JSON object') from None
    payload.update(SENDGRID_API_KEY=api_key.strip(), HOLODECK_EMAIL_FROM=sender)
    updated = run(command + ['secretsmanager', 'put-secret-value', '--secret-id', secret_id,
                            '--secret-string', 'file:///dev/stdin', '--output', 'json'],
                  input=json.dumps(payload), capture_output=True, text=True, check=False)
    if updated.returncode:
        raise RuntimeError('AWS Secrets Manager update failed; no secret values were printed')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sender', default='hello@replayconf.com', help='Already verified SendGrid sender address')
    parser.add_argument('--profile', help='AWS CLI profile with access to this demo secret')
    parser.add_argument('--region', default='us-west-1')
    parser.add_argument('--secret-id', default='fieldkit/reinvent-2026/email')
    args = parser.parse_args()
    print(f'Updating existing secret {args.secret_id} in {args.region}; no email will be sent.')
    if not sys.stdin.isatty():
        raise SystemExit('Run this setup from an interactive terminal so the key stays hidden')
    key = getpass.getpass('SendGrid API key (hidden): ')
    try:
        update_email_secret(key, args.sender, secret_id=args.secret_id, region=args.region, profile=args.profile)
    except (ValueError, RuntimeError, FileNotFoundError) as error:
        raise SystemExit(str(error)) from None
    print('Email settings stored. Verify the Photo Booth worker has picked up this secret version before testing delivery.')


if __name__ == '__main__':
    main()

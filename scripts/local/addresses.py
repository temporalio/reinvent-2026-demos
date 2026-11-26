#!/usr/bin/env python3
"""Print the laptop addresses that other booth stations can use; no internet calls."""
import ipaddress
import json
from pathlib import Path
import platform
import re
import subprocess
import sys


def output(*args):
    try:
        result = subprocess.run(args, capture_output=True, text=True, timeout=3, check=False)
        return result.stdout if result.returncode == 0 else ''
    except (OSError, subprocess.TimeoutExpired):
        return ''


def usable(value):
    try:
        address = ipaddress.IPv4Address(value)
        return not (address.is_loopback or address.is_link_local or address.is_unspecified or address.is_multicast)
    except ipaddress.AddressValueError:
        return False


def lan_addresses(system=None):
    """Prefer the default physical interface and list other active LAN interfaces."""
    rows = []
    if (system or platform.system()) == 'Darwin':
        default = re.search(r'interface:\s*(\S+)', output('/sbin/route', '-n', 'get', 'default'))
        preferred = default[1] if default else None
        devices = re.findall(r'Device:\s*(en\d+)\b', output('/usr/sbin/networksetup', '-listallhardwareports'))
        if preferred and re.fullmatch(r'en\d+', preferred):
            devices = [preferred, *devices]
        for device in dict.fromkeys(devices):
            address = output('/usr/sbin/ipconfig', 'getifaddr', device).strip()
            if usable(address):
                rows.append((device, address))
    else:
        try:
            routes = json.loads(output('ip', '-j', '-4', 'route', 'show', 'default') or '[]')
            preferred = next((r['dev'] for r in routes if 'dev' in r), None)
            interfaces = json.loads(output('ip', '-j', '-4', 'addr', 'show') or '[]')
            interfaces.sort(key=lambda item: item.get('ifname') != preferred)
            for item in interfaces:
                device = item.get('ifname', '')
                if re.match(r'^(lo$|docker|br-|veth|tun|tap|wg|tailscale)', device):
                    continue
                for info in item.get('addr_info', []):
                    address = info.get('local', '')
                    if usable(address):
                        rows.append((device, address))
        except (ValueError, KeyError, TypeError):
            pass
    return list(dict.fromkeys(rows))


def startup_lines(binding, addresses=None):
    host, port, _ = binding.split(':')
    lines = [f'Local booth: http://localhost:{port}', f'Laptop controls: http://localhost:{port}/config']
    if host != '0.0.0.0':
        return [*lines, 'LAN access is disabled. Use BOOTH_BIND_ADDRESS=0.0.0.0 to connect other stations.']
    rows = lan_addresses() if addresses is None else addresses
    if not rows:
        return [*lines, 'Listening on all interfaces; no LAN IPv4 address detected. Check Wi-Fi or Ethernet.']
    for interface, address in rows:
        lines.append(f'LAN booth ({interface}): http://{address}:{port}')
    lines.append(f'For other stations: CONTROL_HUB_URL=http://{rows[0][1]}:{port}')
    return lines


if __name__ == '__main__':
    import yaml
    config = yaml.safe_load(Path(sys.argv[1]).read_text())
    print('\n'.join(startup_lines(config['services']['gateway']['ports'][0])))

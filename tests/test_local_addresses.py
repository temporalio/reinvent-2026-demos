"""LAN startup instructions must be usable without internet or a VPN address."""
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('local_addresses', Path(__file__).resolve().parents[1]/'scripts/local/addresses.py')
addresses = importlib.util.module_from_spec(spec)
spec.loader.exec_module(addresses)


class AddressTests(unittest.TestCase):
    def test_lan_output_includes_actual_port_and_copyable_station_setting(self):
        lines = addresses.startup_lines('0.0.0.0:15119:8080', [('en0','192.168.50.10')])
        self.assertIn('LAN booth (en0): http://192.168.50.10:15119', lines)
        self.assertIn('For other stations: CONTROL_HUB_URL=http://192.168.50.10:15119', lines)

    def test_loopback_binding_never_advertises_remote_access(self):
        with patch.object(addresses, 'lan_addresses', side_effect=AssertionError('must not probe interfaces')):
            lines = addresses.startup_lines('127.0.0.1:15101:8080')
        self.assertTrue(any('LAN access is disabled' in line for line in lines))
        self.assertFalse(any('CONTROL_HUB_URL=' in line for line in lines))

    def test_mac_uses_physical_lan_when_vpn_is_default(self):
        def fake(*args):
            if args[0]=='/sbin/route':return 'interface: utun7\n'
            if args[0]=='/usr/sbin/networksetup':return 'Device: en0\nDevice: en1\nDevice: bridge0\n'
            return {'en0':'192.168.1.24\n','en1':'169.254.1.2\n'}.get(args[-1], '')
        with patch.object(addresses,'output',side_effect=fake):
            self.assertEqual(addresses.lan_addresses('Darwin'), [('en0','192.168.1.24')])

    def test_missing_lan_is_explicit(self):
        self.assertIn('no LAN IPv4 address detected', addresses.startup_lines('0.0.0.0:15101:8080',[])[-1])

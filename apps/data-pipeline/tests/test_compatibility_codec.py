"""Exercise the real cryptography/protobuf boundary after dependency upgrades."""
import unittest
from cryptography.exceptions import InvalidTag
from temporalio.api.common.v1 import Payload
from encryption_codec import EncryptionCodec

class CodecCompatibilityTests(unittest.IsolatedAsyncioTestCase):
    async def test_metadata_and_bytes_survive_authenticated_roundtrip(self):
        codec=EncryptionCodec('synthetic',b'x'*32)
        source=Payload(metadata={'encoding':b'json/plain','custom':b'preserve'},data=b'{"job":"synthetic"}')
        encrypted=(await codec.encode([source]))[0]
        self.assertNotEqual(encrypted.data,source.data)
        self.assertEqual((await codec.decode([encrypted]))[0],source)
        self.assertEqual((await codec.decode([source]))[0],source)

    async def test_tampered_payload_is_rejected(self):
        codec=EncryptionCodec('synthetic',b'x'*32)
        encrypted=(await codec.encode([Payload(data=b'synthetic')]))[0]
        encrypted.data=encrypted.data[:-1]+bytes([encrypted.data[-1]^1])
        with self.assertRaises(InvalidTag):await codec.decode([encrypted])

"""Keep the independently built booth keyboard copies consistent."""
import ast
from pathlib import Path
import re
import unittest
ROOT = Path(__file__).resolve().parents[1]
class TouchKeyboardsTests(unittest.TestCase):
    def test_native_keyboards_share_qwerty_numbers_and_email_punctuation(self):
        paths=[ROOT/'apps'/app/'web/src/shared/keyboard.ts' for app in ['flight-simulator','photo-booth']]
        self.assertEqual(paths[0].read_text(),paths[1].read_text())
        source=paths[0].read_text()
        rows=ast.literal_eval(re.search(r'const ROWS = (\[.*?\]);',source)[1])
        symbols=ast.literal_eval(re.search(r'const EMAIL_SHORTCUTS = (\[.*?\]);',source)[1])
        self.assertEqual(rows,['1234567890','qwertyuiop','asdfghjkl','zxcvbnm'])
        self.assertTrue({'@','.','+','_','-'}.issubset(symbols))
    def test_react_keyboards_share_one_layout_and_visual_contract(self):
        primary=(ROOT/'apps/launchpad/src/ship-ui/components/OnScreenKeyboard.tsx').read_text()
        for app in ['flight-simulator','photo-booth']:
            self.assertEqual(primary,(ROOT/'apps'/app/'web/src/ship-ui/components/OnScreenKeyboard.tsx').read_text())
        self.assertIn("const NUMBERS = '1234567890'",primary)
        self.assertIn("['qwertyuiop', 'asdfghjkl', 'zxcvbnm']",primary)
        self.assertIn("['@', '+', '_', '-']",primary)
        self.assertIn('touch-keyboard-row',primary)
        for path in ['apps/launchpad/src/index.css','apps/launchpad/public/booth/embed.css']:
            self.assertIn('/booth/keyboard.css',(ROOT/path).read_text())

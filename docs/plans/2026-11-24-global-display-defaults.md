# Global Display Defaults

All stations sets width, height, x/y position, content zoom, and Temporal UI zoom. Each station inherits those defaults and can override individual fields. Use global clears a field override; Use global geometry clears the five geometry overrides while preserving an independent Temporal UI zoom choice.

The hub stores global defaults and sparse station overrides and returns resolved settings. Legacy custom geometry is preserved. Both stores and cached/offline settings use the same inheritance rules. An explicit override remains fixed even if it equals the current global default.

Keep the controls in their original arrangement. Overlay a transparent, click-through red rectangle on the current screen at the draft frame's actual coordinates. Use the live launchpad bounds when available; /config uses a measurement-only shell with the same header/footer spacing. The outline appears only after a size/position adjustment and disappears 1.5 seconds after the last adjustment. Further adjustments restart that timer. It stays fixed while controls scroll and does not load a demo or save settings. There is no miniature or reference-orientation selector.

The laptop writes configuration over HTTP. Each station polls its shared hub every two seconds. A disconnected hub is handled by retaining cached settings, with built-in defaults for a fresh browser. No Temporal Activity carries configuration.

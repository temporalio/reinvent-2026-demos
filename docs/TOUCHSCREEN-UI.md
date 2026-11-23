# Touchscreen presentation

The saved station rectangle is the complete demo budget. Its upper application area and lower information area each receive half the height. Titles sit outside that budget. The stage and its iframe wrappers do not scroll. Station zoom scales a bounded inner surface, with inverse dimensions so 75%, 100%, or 125% cannot push the bottom half outside the rectangle.

Banking and Tacos have compact native customer/control views. Other legacy dashboards measure their content into the upper viewport instead of nesting scrollable panels. Flight and Photo Booth keep a combined upper application area. Temporal UI itself is not restyled.

Business impact and Architecture fit in the lower half. Workflow code has one scrolling code region beneath eight SDK icon buttons; each demo has one short example in each language. Temporal UI scrolls in its iframe with no enclosing scrolling stage. See [code provenance](CODE-EXAMPLES.md). Workflow links from the owned application iframe select the lower Temporal tab; background workflow updates do not select a tab. The Temporal UI iframe loads once and later workflows navigate inside it, without a full reload. The launchpad hides Temporal UI's sidebar and namespace top bar and zooms the panel to 120%. Other frame origins/sources are rejected.

Screensaver is beside Ziggy in the footer. Its planet cards remain interactive, but Launch and background exits always lead to crew selection. Returning to the screensaver clears stale demo selection. After 30 seconds without input, the footer shows a five-second countdown; input resets the clock. This includes owned same-origin app and Temporal documents. Background requests and DOM updates do not reset it. Running Flight Simulator and Photo Booth are exempt, as are staff controls; closing staff controls starts a fresh timer.

Mission cards use toolkit icons, short descriptions, and capability tags. Tags distinguish hosted Lambda/Bedrock requirements from the credential-free local preview. On/Off/Inherit policy and runtime availability still gate launch buttons.

The gradient artwork is anchored to the full screensaver viewport, outside the centered portrait artboard, so a different aspect ratio does not leave a hard left inset.

## Preview a position before saving

In staff controls, select a station, change its Demo area values, then tap **Preview position**. The real Tacos layout renders with those unsaved dimensions. The arrow beside Screensaver/Ziggy returns directly to the same unlocked draft. Preview does not PATCH the control API, change the selected station identity, or require a temporary save/undo. Only **Save settings** applies the draft. Staff preview does not time out.

Preview uses the current browser viewport. A laptop preview cannot certify physical reach on a different television; verify final placement on the station. Its Screensaver button is a staff preview with a persistent Back control; leaving that preview returns to the staff draft.

## Character artwork

The toolkit's main tree at `da8ce54b01f9d7f96f9a4649691e802f69b00c1c` was checked. It includes the Cosmic Pop theme, customer logos, Ziggy, icons, and general illustrations. The Captain, Mech, Envoy, Solarian, and Space Wizard portrait exports shown in the design screenshots are absent. They have not been replaced with fabricated character artwork. Original exports are still needed to finish that part of crew selection.

## Recheck locally

With the local demos running and `agent-browser` installed:

```bash
python3 scripts/local/check-touch-layout.py --url http://localhost:15101 --with-code
```

The checker uses loopback HTTP only. It measures equal tracks, station/document overflow, clipped controls, nested native scrolling, fitting business/architecture content, and all eight example switches. It does not execute paid providers or claim to validate compiled translations. Use `--width 2160 --height 3840` for portrait 4K. Real television/stylus testing remains separate.

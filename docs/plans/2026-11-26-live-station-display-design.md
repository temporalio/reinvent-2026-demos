# Live station display controls

The controller sends authenticated display drafts with a per-editor sequence and
an eight-second renewable lease. Booths poll every 500 ms and apply live geometry
without remounting their demo iframe. Save commits the layout; Discard clears the
lease. Drafts never enter persistent browser caches. Global drafts preserve station
overrides. The controller has no red outline; booth-local editing retains its
1.5-second outline.

A controller save can atomically retain a reusable display preset. Booths explicitly
load that preset through a read-only route, apply it and persist a local copy.
Unavailable controllers fall back to the cached preset. A display-generation marker
lets a later controller display save supersede local geometry without having
unrelated settings erase it. Local storage failures are reported.

Managed stations always serve launchpad UI/static media from their prepared local
stack. Demo/API and runtime-capability routes follow online/offline selection;
control requests continue to the laptop. The supervisor prepares and recovers its
local launcher even in online mode. This avoids outdated hosted navigation hiding
current station controls.

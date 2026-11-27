# Booth update and recovery

Ian approved both a Desktop launcher and a per-station Mission Control update.
Mini checkouts live under `~/riv/reinvent-2026-demos`; installation records the
actual absolute path rather than assuming a particular user's home directory.

The existing signed station-command channel gains only the fixed `update` action.
It requires a connected supervisor at version 5 or newer, cannot target every station, and
serializes station updates. No API accepts shell commands, repository URLs or
branch names. The supervisor opens a fixed installed command in Terminal outside
its LaunchAgent so its own replacement can finish.

One standard-library Python helper serves both entry points. It locks duplicate
launches, requires the expected public origin, clean tracked files and main,
fetches main, refuses divergence and fast-forwards. It runs the existing explicit
booth startup with the installed station configuration. Update progress and
revision are reported separately from receipt of the command. Pairing, runtime
preference, browser profile and named Docker volumes are retained.

Browser crash recovery remains independent of GitHub. Explicit update failure
attempts a cached supervisor restart and reports failure; it cannot promise a
rollback of a checkout or partially updated containers. Tests use real local Git
repositories, signed controller requests, native supervisor locks and Docker
builds. Physical macOS Desktop/Terminal permissions and Mini recovery are station
acceptance checks, not claims established by those tests.

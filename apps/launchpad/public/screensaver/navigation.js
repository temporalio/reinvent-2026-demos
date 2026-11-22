/* Every attract-loop exit starts a fresh visitor at crew selection. */
window.boothExitScreensaver = function boothExitScreensaver() {
  if (window.parent !== window) {
    document.dispatchEvent(new CustomEvent('reinvent:exit'));
    return;
  }
  const target = new URL('/?screen=crew', window.location.origin);
  const station = new URLSearchParams(window.location.search).get('station');
  if (/^[1-4]$/.test(station || '')) target.searchParams.set('station', station);
  window.location.assign(target.href);
};

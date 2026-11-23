/* Background exits start a fresh visitor at crew selection. */
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

/* Planet Launch opens its selected demo; background taps use the crew exit above. */
window.boothLaunchDemo = function boothLaunchDemo(demoId) {
  if(typeof demoId!=='string' || !/^[a-z0-9-]+$/.test(demoId))return;
  if(window.parent!==window) {
    document.dispatchEvent(new CustomEvent('reinvent:launch',{detail:{demoId}}));
    return;
  }
  const target=new URL('/',window.location.origin);
  target.searchParams.set('demo',demoId);
  const station=new URLSearchParams(window.location.search).get('station');
  if(/^[1-4]$/.test(station||''))target.searchParams.set('station',station);
  window.location.assign(target.href);
};

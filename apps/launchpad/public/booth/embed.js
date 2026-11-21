// Apply the shared booth theme only when a demo is opened by the launchpad.
if (new URLSearchParams(location.search).get('booth') === '1') {
  document.documentElement.dataset.booth = 'true'
  document.documentElement.dataset.demo = location.pathname.split('/')[1]
  const style = document.createElement('link')
  style.rel = 'stylesheet'
  style.href = '/booth/embed.css'
  document.head.append(style)
  // Keep the shared Temporal tab focused on the execution the native app exposes.
  let lastWorkflow = ''
  function publishWorkflow() {
    for (const anchor of document.querySelectorAll('a[href]')) {
      const url = new URL(anchor.href, location.href)
      if (url.origin !== location.origin || !url.pathname.startsWith('/_temporal/') || !/\/workflows\/[^/?#]+/.test(url.pathname)) continue
      if (url.href !== lastWorkflow) {
        lastWorkflow = url.href
        parent.postMessage({type:'booth:workflow', url:url.href}, location.origin)
      }
    }
  }
  function observe() {
    new MutationObserver(publishWorkflow).observe(document.body, {childList:true, subtree:true, attributes:true, attributeFilter:['href']})
    publishWorkflow()
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', observe, {once:true})
  else observe()
}

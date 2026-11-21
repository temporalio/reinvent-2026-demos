// One native application session per booth frame. Full-page demo navigation keeps
// the theme by checking its actual parent frame, rather than storing a global flag.
function isBoothFrame() {
  try {
    return parent !== window && parent.location.origin === location.origin &&
      [...parent.document.querySelectorAll('.app-viewport iframe, iframe.native-stage')].some(frame => frame.contentWindow === window)
  } catch { return false }
}
if (new URLSearchParams(location.search).get('booth') === '1' || isBoothFrame()) {
  document.documentElement.dataset.booth = 'true'
  document.documentElement.dataset.demo = location.pathname.split('/')[1]
  const style = document.createElement('link')
  style.rel = 'stylesheet'
  style.href = '/booth/embed.css'
  document.head.append(style)
  let lastWorkflow = ''
  function publishWorkflow() {
    const links = [...document.querySelectorAll('a[href]')].map(anchor => new URL(anchor.href, location.href))
      .filter(url => url.origin === location.origin && url.pathname.startsWith('/_temporal/') && /\/workflows\/[^/?#]+/.test(url.pathname))
    const latest = links.at(-1)?.href
    if (latest && latest !== lastWorkflow) {
      lastWorkflow = latest
      parent.postMessage({type:'booth:workflow', url:latest}, location.origin)
    }
  }
  async function showRuntimeNotice() {
    const demo = document.documentElement.dataset.demo
    if(!['loans','no-roads'].includes(demo)) return
    try {
      const response = await fetch('/' + demo + '/api/runtime')
      if(!response.ok) return
      const runtime = await response.json()
      if(demo === 'no-roads' && runtime.lambda === false) {
        document.documentElement.dataset.executionMode = 'native'
        const label = document.querySelector('#stat-lambda')?.closest('.stat-card')?.querySelector('.stat-label')
        if(label) label.textContent = 'Lambda · hosted only'
        const chartLabel = document.querySelector('.charts-grid .card:first-child .card-label')
        if(chartLabel) chartLabel.textContent = 'Lambda concurrency · hosted only'
      }
      if(demo === 'loans' && runtime.execution_available === false) {
        document.querySelectorAll('#custom-submit-btn,#bulk-start-btn,#submit-btn,.btn-approve,.btn-reject,.btn-danger').forEach(button => {
          button.disabled = true
          button.title = 'Underwriting requires a configured Bedrock worker'
        })
      }
      if(runtime.notice) {
        const notice = document.createElement('aside')
        notice.className = 'booth-native-notice'
        notice.setAttribute('role','status')
        notice.textContent = runtime.notice
        document.body.prepend(notice)
      }
    } catch { /* The server remains the authority for provider availability. */ }
  }
  function observe() {
    document.addEventListener('click', event => {
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null
      if(!anchor || parent === window) return
      const destination = new URL(anchor.href,location.href)
      if(destination.origin === location.origin && destination.pathname === '/' && !destination.search) {
        event.preventDefault()
        parent.postMessage({type:'booth:navigate',screen:'missions'}, location.origin)
      }
    },true)
    new MutationObserver(publishWorkflow).observe(document.body, {childList:true, subtree:true, attributes:true, attributeFilter:['href']})
    publishWorkflow()
    void showRuntimeNotice()
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', observe, {once:true})
  else observe()
}

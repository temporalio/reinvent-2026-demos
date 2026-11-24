// Native full-page navigations inherit booth mode only from their owning frame.
function boothFrame() {
  try {
    return parent !== window && parent.location.origin === location.origin
      ? [...parent.document.querySelectorAll('.app-viewport iframe, iframe.native-stage')].find(frame => frame.contentWindow === window)
      : null
  } catch { return null }
}
const parentBoothFrame = boothFrame()
const boothParams = new URLSearchParams(location.search)
const frameParams = parentBoothFrame ? new URL(parentBoothFrame.src, location.href).searchParams : new URLSearchParams()
if (boothParams.get('booth') === '1' || parentBoothFrame) {
  document.documentElement.dataset.booth = 'true'
  document.documentElement.dataset.demo = location.pathname.split('/')[1]
  const sharedStage = boothParams.get('sharedStage') === '1' || frameParams.get('sharedStage') === '1'
  if(sharedStage)document.documentElement.dataset.sharedStage = 'true'
  const style = document.createElement('link')
  style.rel = 'stylesheet'
  style.href = '/booth/embed.css'
  document.head.append(style)
  const keyboard = document.createElement('script')
  keyboard.src = '/booth/touch-keyboard.js'
  document.head.append(keyboard)
  let lastWorkflow = ''
  let uiBase = null
  const runtimeReady = fetch('/runtime-config.json').then(response=>response.ok?response.json():null).then(runtime=>{
    if(!runtime?.temporalUi)return
    const url=new URL(runtime.temporalUi,location.origin)
    if(url.origin===location.origin && url.pathname.startsWith('/_temporal/'))uiBase=url
  }).catch(()=>{})
  function isTemporalLink(url) {
    if(url.username || url.password || !['http:','https:'].includes(url.protocol))return false
    const loopback = host => ['localhost','127.0.0.1','[::1]','::1'].includes(host)
    const localUi = loopback(location.hostname) && loopback(url.hostname) && /\/namespaces\/[^/]+\/workflows(?:\/|$)/.test(url.pathname)
    return localUi || (url.origin===location.origin && url.pathname.startsWith('/_temporal/')) ||
      (url.origin==='https://cloud.temporal.io' && /^\/namespaces\/[^/]+\/workflows(?:\/|$)/.test(url.pathname))
  }
  function embeddedTemporalUrl(url) {
    if(!isTemporalLink(url))return null
    if(url.origin===location.origin && url.pathname.startsWith('/_temporal/'))return url.href
    if(!uiBase)return null
    const route=url.pathname.match(/\/workflows(\/.*)?$/)
    if(!route || !/\/workflows\/?$/.test(uiBase.pathname))return null
    const destination=new URL(uiBase.href)
    destination.pathname=destination.pathname.replace(/\/workflows\/?$/,'/workflows')+(route[1]||'')
    destination.search=url.search
    destination.hash=url.hash
    return destination.href
  }
  function publishWorkflow() {
    const links = [...document.querySelectorAll('a[href]')].map(anchor => ({anchor,url:new URL(anchor.href, location.href)}))
    for(const {anchor,url} of links){
      if(!isTemporalLink(url))continue
      anchor.removeAttribute('target')
      anchor.setAttribute('data-booth-temporal','true')
      anchor.title='Show workflow in the lower Temporal UI panel'
      const label=anchor.textContent.replace(/↗/g,'').replace('Open execution','View workflow').trim()
      if(label!==anchor.textContent)anchor.textContent=label
    }
    const latest=links.map(({url})=>embeddedTemporalUrl(url)).filter(value=>value && /\/workflows\/[^/?#]+/.test(new URL(value).pathname)).at(-1)
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
  // Give legacy dashboards a measured, bounded canvas rather than nested scrolling.
  // Banking/Tacos have compact native layouts; the remaining apps use a virtual canvas.
  // Travel Agent's chat grows with every message, so fitting it to the frame would zoom the
  // whole page out a little further on each reply. It keeps its own scrolling conversation.
  const virtualFit = sharedStage && !['banking','dejavutacos','flightsim','photobooth','agentcore-oncall','travel-agent'].includes(document.documentElement.dataset.demo)
  let fitPending = false
  function fitNativeCanvas() {
    fitPending = false
    if(!sharedStage)return
    const root=document.documentElement
    root.dataset.boothFit='measuring'
    if(virtualFit) {
      const body=document.body
      body.style.zoom='1'
      body.style.width=innerWidth+'px'
      body.style.height='auto'
      root.style.setProperty('--booth-canvas-height',innerHeight+'px')
      // Expand native scroll regions before measuring their real content. The outer
      // iframe itself remains fixed and the fitted result never needs a scrollbar.
      document.querySelectorAll('body *').forEach(element=>{
        const style=getComputedStyle(element)
        if(['auto','scroll'].includes(style.overflowY) || ['auto','scroll'].includes(style.overflowX) ||
          (style.overflowY==='hidden' && element.scrollHeight>element.clientHeight+2 && element.querySelector('button,input,select,textarea')))element.dataset.boothScrollfit='true'
      })
      // Fixed layers (backdrops such as Travel Agent's grid floor) are pinned to the viewport,
      // not page content. One sized from the canvas width grows with every pass below and
      // would shrink the page toward nothing, so they and their contents are not measured.
      const fixedLayers=[...document.querySelectorAll('body *')].filter(element=>getComputedStyle(element).position==='fixed')
      let scale=1
      // Keep the fitted canvas full width. Reflowing at its virtual width also
      // avoids needlessly shrinking long labels and forms into a narrow column.
      for(let pass=0;pass<6;pass++) {
        body.style.width=(innerWidth/scale)+'px'
        let bottom=Math.max(innerHeight,body.getBoundingClientRect().bottom), right=innerWidth/scale
        document.querySelectorAll('body *').forEach(element=>{
          if(element.closest('dialog:not([open]),[hidden]') || fixedLayers.some(layer=>layer.contains(element)))return
          const rect=element.getBoundingClientRect()
          if(rect.width && rect.height && getComputedStyle(element).visibility!=='hidden') {
            bottom=Math.max(bottom,rect.bottom)
            right=Math.max(right,rect.right)
          }
        })
        // The body's border/padding contributes to document height even when no
        // child reaches its bottom edge. Measure it instead of clipping that edge.
        bottom=Math.max(bottom,body.getBoundingClientRect().top+body.scrollHeight)
        const next=Math.min(1,innerHeight/(bottom+2),innerWidth/(right+2))
        if(Math.abs(next-scale)<.0001){scale=next;break}
        scale=next
      }
      body.style.zoom=String(scale)
      root.dataset.boothFitScale=String(scale)
    }
    root.dataset.boothFit='ready'
  }
  function scheduleFit() {
    if(!sharedStage || fitPending)return
    fitPending=true
    requestAnimationFrame(()=>requestAnimationFrame(fitNativeCanvas))
  }
  style.addEventListener('load',scheduleFit)
  window.addEventListener('resize',scheduleFit)
  window.addEventListener('load',scheduleFit)
  document.fonts?.ready.then(scheduleFit)
  function observe() {
    document.addEventListener('click', event => {
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null
      if(!anchor || parent === window) return
      const destination = new URL(anchor.href,location.href)
      if(isTemporalLink(destination)) {
        event.preventDefault()
        event.stopPropagation()
        void runtimeReady.then(()=>{
          const url=embeddedTemporalUrl(destination)
          if(url)parent.postMessage({type:'booth:workflow',url:/\/workflows\/[^/?#]+/.test(new URL(url).pathname)?url:lastWorkflow||url,activate:true},location.origin)
        })
        return
      }
      if(destination.origin === location.origin && destination.pathname === '/' && !destination.search) {
        event.preventDefault()
        parent.postMessage({type:'booth:navigate',screen:'missions'}, location.origin)
      }
    },true)
    new MutationObserver(records=>{
      if(records.every(record=>record.type==='attributes' && record.target===document.body))return
      publishWorkflow();scheduleFit()
    }).observe(document.body, {childList:true, subtree:true, attributes:true, attributeFilter:['href','open','class','style']})
    publishWorkflow()
    scheduleFit()
    void runtimeReady.then(publishWorkflow)
    void showRuntimeNotice()
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', observe, {once:true})
  else observe()
}

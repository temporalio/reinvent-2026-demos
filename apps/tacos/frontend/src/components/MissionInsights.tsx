import { useId, useRef, useState, type KeyboardEvent } from 'react'
import { PanelViewport } from './PanelViewport'
import { TemporalCodeView } from './TemporalCodeView'
import { BackstagePanel } from './BackstagePanel'
import { initialPersona, localFrameUrl, latestStep, paymentLabel, personaTabs, safeUiUrl, type InsightTab, type Persona } from '../lib/mission'
import { orderStepStatus } from '../lib/stepStatus'
import type { OrderEvent, Settings, TemporalUiInfo } from '../types'

interface Props {
  events: OrderEvent[]
  finalStatus: string | null
  settings: Settings
  workflowId: string | null
  temporalUi: TemporalUiInfo | null
  temporalWorkflowUrl: string | null
  storeOnline: boolean | null
}
const tabs: { id: InsightTab; label: string }[] = [
  { id: 'business', label: 'Business impact' }, { id: 'architecture', label: 'Architecture' },
  { id: 'code', label: 'Workflow code' }, { id: 'temporal', label: 'Temporal UI' },
]
const flow = [
  ['validate_order', 'Validate order', 'Cart service'], ['validate_store', 'Find the kitchen', 'Store service'],
  ['authorize_payment', 'Hold payment', 'Payment service'], ['clear_cart', 'Clear cart', 'Cart service'],
  ['submit_to_store', 'Send to kitchen', 'Store service'], ['order_ready', 'Wait for ready', 'Kitchen Signal / 1h timeout'],
  ['capture_payment', 'Capture payment', 'Payment service'], ['release_payment_hold', 'Release hold', 'Compensation if needed'],
]

export function MissionInsights(props: Props) {
  const [persona, setPersona] = useState(() => initialPersona(window.location.search))
  const [tab, setTab] = useState<InsightTab>(() => personaTabs[initialPersona(window.location.search)])
  const id = useId()
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const storeEvent = latestStep(props.events, 'submit_to_store')
  const executionUrl = safeUiUrl(props.temporalWorkflowUrl)
  function onTabKey(event: KeyboardEvent<HTMLDivElement>) {
    const current = tabs.findIndex((item) => item.id === tab)
    const next = { ArrowRight: (current + 1) % tabs.length, ArrowLeft: (current + tabs.length - 1) % tabs.length, Home: 0, End: tabs.length - 1 }[event.key]
    if (next === undefined) return
    event.preventDefault()
    setTab(tabs[next].id)
    refs.current[next]?.focus()
  }
  return (
    <section className="mission-panel insight-panel" aria-labelledby={`${id}-title`}>
      <header className="insight-heading"><div><p className="eyebrow">03 / UNDER THE HOOD</p><h2 id={`${id}-title`}>One order. Every perspective.</h2></div>
        <label className="persona-picker">Perspective<select value={persona} onChange={(event) => { const next = event.target.value as Persona; setPersona(next); setTab(personaTabs[next]) }}>
          <option value="captain">Captain</option><option value="mech">Mech</option><option value="envoy">Envoy</option><option value="solarian">Solarian</option>
        </select></label>
      </header>
      <div className="insight-tabs" role="tablist" aria-label="Demo information" onKeyDown={onTabKey}>
        {tabs.map((item, index) => <button key={item.id} ref={(element) => { refs.current[index] = element }} role="tab" id={`${id}-tab-${item.id}`} aria-controls={`${id}-panel-${item.id}`} aria-selected={tab === item.id} tabIndex={tab === item.id ? 0 : -1} onClick={() => setTab(item.id)}>{item.label}</button>)}
      </div>
      {tabs.map((item) => <div className="insight-body" role="tabpanel" tabIndex={0} key={item.id} id={`${id}-panel-${item.id}`} aria-labelledby={`${id}-tab-${item.id}`} hidden={tab !== item.id}>
        <PanelViewport label={item.label}>
        {item.id === 'business' && <div className="business-view">
          <p className="eyebrow">{props.settings.mode === 'temporal' ? 'TEMPORAL / DURABLE EXECUTION' : 'TRADITIONAL / DIRECT CALLS'}</p>
          <h3>{props.finalStatus === 'completed' ? 'Order delivered through the workflow.' : props.finalStatus ? 'The order has finished. Inspect the outcome below.' : storeEvent?.status === 'retrying' ? 'A kitchen outage. A recoverable order.' : 'Keep the order moving. Even when a service stops.'}</h3>
          <p>{props.settings.mode === 'temporal' ? 'Temporal records progress, retries failed Activities, and waits for the kitchen. If this order cannot finish, the Workflow attempts to release the payment hold.' : 'The same order uses direct service calls. A store outage stops the request without automatic recovery.'}</p>
          <div className="mission-metrics"><article><span>PAYMENT</span><strong>{paymentLabel(props.events)}</strong></article><article><span>KITCHEN DELIVERY</span><strong>{storeEvent ? `Attempt ${storeEvent.attempt}` : 'Not started'}</strong></article><article><span>ORDER</span><strong>{props.finalStatus ?? (props.events.length ? 'In progress' : 'Not started')}</strong></article></div>
          <p className="mission-note">Live values come from this order. Payments and kitchen failures are simulated.</p>
          <BackstagePanel events={props.events} settings={props.settings} finalStatus={props.finalStatus} workflowId={props.workflowId} temporalWorkflowUrl={executionUrl} />
        </div>}
        {item.id === 'architecture' && <div className="architecture-view">
          <div className="architecture-summary"><span className="eyebrow">{props.settings.mode === 'temporal' ? 'TEMPORAL ORCHESTRATES THE ORDER' : 'DIRECT SERVICE CALLS'}</span><p>Kitchen connection: {props.storeOnline === null ? 'unknown' : props.storeOnline ? 'online' : 'offline (simulated)'}</p></div>
          <p>Follow the order through its Activities. A moving edge marks a running step or retry; completed steps keep their state.</p>
          <SystemMap events={props.events} isTemporal={props.settings.mode === 'temporal'} />
          <ol className="order-flow">{flow.map(([key, label, service], index) => {
            const status = orderStepStatus(key, props.events, props.finalStatus)
            const event = latestStep(props.events, key)
            return <li key={key} data-status={status}><span className="flow-number">{String(index + 1).padStart(2, '0')}</span><div><h3>{label}</h3><p>{service}</p></div><span className="flow-state">{status}{event && event.attempt > 1 ? ` / ${event.attempt}` : ''}</span></li>
          })}</ol><p className="mission-note">The final node is the compensation branch, not a step after successful payment. State comes from the shared order event stream.</p>
        </div>}
        {item.id === 'code' && <><p className="mission-note">{props.settings.mode === 'traditional' ? 'Direct-call mode does not execute this Workflow.' : 'This order uses the configured Temporal worker.'}</p><TemporalCodeView events={props.events} finalStatus={props.finalStatus} runningLanguage={props.settings.worker_language} /></>}
        {item.id === 'temporal' && <TemporalPanel temporalUi={props.temporalUi} workflowUrl={executionUrl} isTemporal={props.settings.mode === 'temporal'} workflowId={props.workflowId} />}
        </PanelViewport>
      </div>)}
    </section>
  )
}

function TemporalPanel({ temporalUi, workflowUrl, isTemporal, workflowId }: { temporalUi: TemporalUiInfo | null; workflowUrl: string | null; isTemporal: boolean; workflowId: string | null }) {
  const [embeddedUrl, setEmbeddedUrl] = useState<string | null>(null)
  const url = isTemporal ? workflowUrl ?? safeUiUrl(temporalUi?.namespace_url) : null
  const frameUrl = localFrameUrl(url, window.location.origin)
  return <div className="temporal-view">
    <p className="eyebrow">{isTemporal ? 'CURRENT BACKEND / TEMPORAL' : 'DIRECT CALLS / NO TEMPORAL EXECUTION'}</p>
    <h3>{temporalUi?.namespace ?? 'Waiting for backend configuration'}</h3>
    <p>{workflowId && isTemporal ? `Workflow: ${workflowId}` : 'Place a Temporal order to link directly to its execution.'}</p>
    <p>The backend supplies this address for its configured local or Cloud connection. Cloud authentication happens in the Temporal UI.</p>
    {url ? <div className="temporal-actions"><a className="mission-button" href={url} target="_blank" rel="noreferrer">Open Temporal UI ↗</a>
      {frameUrl && <button className="mission-button secondary" onClick={() => setEmbeddedUrl(embeddedUrl === frameUrl ? null : frameUrl)}>{embeddedUrl === frameUrl ? 'Close embedded UI' : 'Embed local UI'}</button>}</div> : <p>No execution link is available in this mode.</p>}
    {embeddedUrl && embeddedUrl === frameUrl && <iframe title="Temporal UI for the configured backend" src={frameUrl} className="temporal-frame" />}
    <p className="mission-note">The external link remains available if authentication or browser framing rules prevent embedding. Zoom gestures inside an embedded Temporal UI are controlled by that application.</p>
  </div>
}

function SystemMap({ events, isTemporal }: { events: OrderEvent[]; isTemporal: boolean }) {
  const current = events.findLast((event) => ['running', 'retrying', 'failed'].includes(event.status))
  const live = events.at(-1)?.status === 'running' || events.at(-1)?.status === 'retrying'
  const activeService = current?.step.includes('payment') ? 'payment' : current?.step.includes('store') || current?.step === 'order_ready' ? 'kitchen' : 'cart'
  const arrow = useId()
  const services = [{ id: 'cart', y: 25, label: 'Cart service' }, { id: 'kitchen', y: 140, label: 'Kitchen service' }, { id: 'payment', y: 255, label: 'Payment service' }]
  return <svg className="system-map" viewBox="0 0 800 355" role="img" aria-label={isTemporal ? 'The app API starts a Workflow in Temporal. A worker runs Workflow code and calls the simulated cart, kitchen, and payment services.' : 'The app API calls the simulated cart, kitchen, and payment services directly.'}>
    <defs><marker id={arrow} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 10 5 0 10z" fill="currentColor" /></marker></defs>
    <g className="map-node"><rect x="20" y="115" width="170" height="60" /><text x="105" y="151">App / API</text></g>
    {isTemporal && <><path className="map-edge" d="M105 175v75h190" markerEnd={`url(#${arrow})`} /><text className="map-caption" x="105" y="281">Start / Signal</text><g className="map-node temporal-node"><rect x="295" y="215" width="185" height="75" /><text x="387" y="245">Temporal</text><text className="map-caption" x="387" y="270">Durable history</text></g><path className="map-edge" d="M387 215v-40" markerEnd={`url(#${arrow})`} markerStart={`url(#${arrow})`} /><g className="map-node"><rect x="295" y="105" width="185" height="70" /><text x="387" y="135">Worker</text><text className="map-caption" x="387" y="159">Workflow + Activities</text></g></>}
    {services.map((service) => <g key={service.id}><path className={`map-edge ${live && activeService === service.id ? 'is-flowing' : ''}`} d={isTemporal ? `M480 140 H535 V${service.y + 30} H605` : `M190 145 H535 V${service.y + 30} H605`} markerEnd={`url(#${arrow})`} /><g className="map-node"><rect x="605" y={service.y} width="175" height="60" /><text x="692" y={service.y + 35}>{service.label}</text></g></g>)}
    <text className="map-caption" x="690" y="345">Simulated services / this Mac</text>
  </svg>
}

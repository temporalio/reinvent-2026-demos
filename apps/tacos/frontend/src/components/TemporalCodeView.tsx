import { useState } from 'react'
import type { OrderEvent, WorkerLanguage } from '../types'
import { WORKFLOW_LANGUAGES, getLanguageDef } from '../data/workflowCode'
import { workflowSources } from '../data/workflowSources'
import { orderStepStatus } from '../lib/stepStatus'

type CodeLanguage = WorkerLanguage | 'swift'
const languages = [...WORKFLOW_LANGUAGES.map(({ id, label }) => ({ id: id as CodeLanguage, label: id === 'dotnet' ? 'C# / .NET' : label })), { id: 'swift' as const, label: 'Swift (community)' }]
const swiftOutline = `// Illustrative Swift-style outline, not executable SDK code.
// Apple maintains the stable community Swift SDK.
// This demo does not include a Swift worker.
// Helpers below describe intent; their SDK implementations are omitted.

func order(_ input: Order) async throws {
    try await validateOrder(input)
    try await validateStore(input)
    // Register compensation before placing the hold.
    try await withPaymentHoldCompensation(input) {
        try await authorizePayment(input)
        try await clearCart(input)
        // Configure Activity retries: up to 10 attempts.
        try await submitToKitchen(input)
        // Wait for order_ready, or the demo's one-hour timeout.
        try await waitForKitchen(input)
        try await capturePayment(input)
    }
}`

export function TemporalCodeView({ events, finalStatus, runningLanguage }: { events: OrderEvent[]; finalStatus: string | null; runningLanguage: WorkerLanguage }) {
  const [selected, setSelected] = useState<CodeLanguage | null>(null)
  const [excerpt, setExcerpt] = useState(false)
  const language = selected ?? runningLanguage
  const native = language === runningLanguage
  const definition = language === 'swift' ? null : getLanguageDef(language)
  const lines = definition ? [...definition.code, ...definition.compensation] : []
  const fullSource = language !== 'swift' ? workflowSources[language] : swiftOutline
  const showExcerpt = language !== 'swift' && (excerpt || !native)
  return <div className="workflow-source">
    <label className="code-language-picker">SDK language<select value={language} onChange={(event) => { setSelected(event.target.value as CodeLanguage); setExcerpt(false) }}>{languages.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
    <p className="source-disclosure">Configured worker: <strong>{getLanguageDef(runningLanguage).label}</strong>. {native ? showExcerpt ? 'Annotated excerpt of the running implementation.' : 'Full Workflow source from this build.' : language === 'swift' ? 'Illustrative outline only. No Swift worker runs in this demo.' : 'Example excerpt in another SDK. This code is not running the order.'}</p>
    {native && <button className="mission-button secondary source-toggle" onClick={() => setExcerpt(!excerpt)}>{excerpt ? 'Show full running source' : 'Show annotated excerpt'}</button>}
    <div className="source-filename">{definition?.filename ?? 'Order.swift (illustrative outline)'}</div>
    <pre className="codeview mission-code" tabIndex={0} aria-label={native && !excerpt ? 'Full Workflow source for configured worker' : 'Illustrative Workflow code'}><code>{showExcerpt ? lines.map((line, index) => {
      const state = line.step ? orderStepStatus(line.step, events, finalStatus) : 'pending'
      const status = state === 'pending' ? undefined : state
      return <span key={index} className={`ln ${status === 'completed' ? 'done' : status ? 'hl' : ''}`} data-status={status}>{'  '.repeat(line.indent)}{line.text || ' '}{'\n'}</span>
    }) : fullSource}</code></pre>
  </div>
}

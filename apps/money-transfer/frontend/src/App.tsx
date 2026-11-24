import { useCallback, useEffect, useState } from 'react'
import { AccountsList } from './components/AccountsList'
import { BankOperations } from './components/BankOperations'
import { SettingsDialog } from './components/SettingsDialog'
import { TemporalCodeView } from './components/TemporalCodeView'
import { TransferBackstage } from './components/TransferBackstage'
import { TransferForm } from './components/TransferForm'
import { TransferReview } from './components/TransferReview'
import { TransferTracker } from './components/TransferTracker'
import { useCodeLanguage } from './hooks/useCodeLanguage'
import { PaneCollapseButton, PaneLayout, PhoneFrame, useLiveEvents } from './kit'
import { SCENARIOS } from './scenarios'
import type {
  Account,
  CreateTransferResponse,
  DemoTab,
  PhoneScreen,
  Settings,
  TemporalUiInfo,
  TransferEvent,
} from './types'

const DEFAULT_SETTINGS: Settings = {
  scenario: 'happy_path',
  presentation_mode: 'detailed',
}

const SHARED_STAGE = new URLSearchParams(window.location.search).get('sharedStage') === '1'

const TRANSFER_EVENTS = { update: 'transfer_update', done: 'transfer_complete' }

function App() {
  const [tab, setTab] = useState<DemoTab>('customer')
  const [screen, setScreen] = useState<PhoneScreen>('accounts')
  const [accounts, setAccounts] = useState<Account[]>([])
  const [fromAccount, setFromAccount] = useState('')
  const [toAccount, setToAccount] = useState('')
  const [amount, setAmount] = useState('')
  const [transferId, setTransferId] = useState<string | null>(null)
  const [workflowId, setWorkflowId] = useState<string | null>(null)
  const [isTransferring, setIsTransferring] = useState(false)
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [executionScenario, setExecutionScenario] = useState<Settings['scenario']>('happy_path')
  const [temporalUi, setTemporalUi] = useState<TemporalUiInfo | null>(null)
  const [temporalWorkflowUrl, setTemporalWorkflowUrl] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [codeLanguage, setCodeLanguage] = useCodeLanguage()

  const { events, finalStatus, state: streamState, reset: resetEvents } = useLiveEvents<TransferEvent>(
    transferId ? `/banking/api/transfers/${transferId}/events` : null,
    TRANSFER_EVENTS,
  )

  useEffect(() => {
    if (window.parent === window) return
    const current = events.filter(event => event.transfer_id === transferId)
    const approval = current.findLast(event => event.step === 'approval_wait')
    const latest = approval?.status === 'running' ? approval : current.at(-1)
    window.parent.postMessage({
      type: 'booth:money-execution', transferId, scenario: executionScenario,
      step: latest?.step ?? null, status: latest?.status ?? null, attempt: latest?.attempt ?? 0,
      finalStatus: latest ? finalStatus : null, streamState,
    }, window.location.origin)
  }, [transferId, events, finalStatus, executionScenario, streamState])

  useEffect(() => {
    fetch('/banking/api/settings')
      .then((r) => r.json())
      .then((s) => setSettings((prev) => ({ ...prev, ...s })))
      .catch(() => {})
    fetch('/banking/api/accounts')
      .then((r) => r.json())
      .then(setAccounts)
      .catch(() => {})
    fetch('/banking/api/temporal-ui')
      .then((r) => r.json())
      .then((data) => {
        if (data?.namespace_url) setTemporalUi(data)
      })
      .catch(() => {})
  }, [])

  const handleNewTransfer = useCallback(() => {
    setTransferId(null)
    setWorkflowId(null)
    setTemporalWorkflowUrl(null)
    setFromAccount('')
    setToAccount('')
    setAmount('')
    setScreen('accounts')
    resetEvents()
  }, [resetEvents])

  const handleSaveSettings = useCallback(
    async (newSettings: Settings) => {
      setSettings(newSettings)
      await fetch('/banking/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings),
      })
      handleNewTransfer()
    },
    [handleNewTransfer]
  )

  const handleConfirmTransfer = useCallback(async () => {
    setIsTransferring(true)
    try {
      const res = await fetch('/banking/api/transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from_account: fromAccount,
          to_account: toAccount,
          amount: parseFloat(amount),
        }),
      })
      const data = (await res.json()) as CreateTransferResponse
      setExecutionScenario(settings.scenario)
      setTransferId(data.transfer_id)
      setWorkflowId(data.workflow_id || null)
      setTemporalWorkflowUrl(data.temporal_ui_url || null)
      setScreen('tracking')
    } finally {
      setIsTransferring(false)
    }
  }, [fromAccount, toAccount, amount, settings.scenario])

  const renderPhoneContent = () => {
    switch (screen) {
      case 'accounts':
        return <AccountsList onStartTransfer={() => setScreen('transfer')} />
      case 'transfer':
        return (
          <TransferForm
            accounts={accounts}
            fromAccount={fromAccount}
            toAccount={toAccount}
            amount={amount}
            onFromChange={setFromAccount}
            onToChange={setToAccount}
            onAmountChange={setAmount}
            onNext={() => setScreen('review')}
            onBack={() => setScreen('accounts')}
          />
        )
      case 'review':
        return (
          <TransferReview
            accounts={accounts}
            fromAccount={fromAccount}
            toAccount={toAccount}
            amount={parseFloat(amount) || 0}
            onConfirm={handleConfirmTransfer}
            onBack={() => setScreen('transfer')}
            isLoading={isTransferring}
          />
        )
      case 'tracking':
        return (
          <TransferTracker
            events={events}
            finalStatus={finalStatus}
            settings={settings}
            onNewTransfer={handleNewTransfer}
          />
        )
    }
  }

  const scenarioLabel =
    SCENARIOS.find((s) => s.value === settings.scenario)?.label ?? settings.scenario

  return (
    <>
      <header className="topbar app-header">
        <a href="/" className="brand" aria-label="Money transfer demo home">
          <img src="/banking/static/temporal-logo.svg" alt="Temporal" width="129" height="33" />
          <span className="brand-divider" />
          <p className="eyebrow">Money transfer</p>
        </a>
        <nav className="segmented" aria-label="Views">
          <button
            type="button"
            aria-current={tab === 'customer' ? 'page' : undefined}
            onClick={() => setTab('customer')}
          >
            Customer app
          </button>
          <button
            type="button"
            aria-current={tab === 'operations' ? 'page' : undefined}
            onClick={() => setTab('operations')}
          >
            Bank operations
          </button>
        </nav>
        <div className="topbar-actions">
          {SHARED_STAGE && <label className="booth-scenario field"><span>Scenario</span><select value={settings.scenario} onChange={event=>void handleSaveSettings({...settings,scenario:event.target.value as Settings['scenario']})}>{SCENARIOS.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}</select></label>}
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="button small secondary ultraviolet booth-scenario-dialog"
            aria-haspopup="dialog"
          >
            Scenario: {scenarioLabel}
          </button>
          <a
            href={temporalUi?.namespace_url || undefined}
            target="_blank"
            rel="noreferrer"
            aria-disabled={temporalUi?.namespace_url ? undefined : true}
            className="button small secondary green booth-temporal-summary"
            title={
              temporalUi
                ? `Open ${temporalUi.namespace} in the Temporal UI`
                : 'Available once the server reports the Temporal UI address'
            }
          >
            Temporal UI &#8599;
          </a>
        </div>
      </header>

      <main className="flex-1 flex min-h-0">
        {tab === 'customer' ? (
          <PaneLayout
            className="flex-1"
            storageKey="banking-demo:panes"
            panes={[
              {
                id: 'phone',
                title: 'Customer app',
                defaultWidth: 380,
                minWidth: 260,
                content: (
                  <div className="pane-stack">
                    <div className="card-head pane-head">
                      <div>
                        <p className="eyebrow">What the customer sees</p>
                        <h2 className="heading">Customer app</h2>
                      </div>
                      <PaneCollapseButton />
                    </div>
                    {SHARED_STAGE ? <div className="booth-banking-product">{renderPhoneContent()}</div> : <PhoneFrame
                      chrome="var(--space-black)"
                      background="var(--space-black)"
                      foreground="var(--off-white)"
                    >{renderPhoneContent()}</PhoneFrame>}
                  </div>
                ),
              },
              {
                id: 'backstage',
                title: 'Behind the scenes',
                defaultWidth: 420,
                minWidth: 260,
                content: (
                  <TransferBackstage
                    events={events}
                    settings={settings}
                    finalStatus={finalStatus}
                    workflowId={workflowId}
                    executionUrl={temporalWorkflowUrl}
                  />
                ),
              },
              {
                id: 'code',
                title: 'Workflow code',
                minWidth: 320,
                content: (
                  <TemporalCodeView
                    events={events}
                    language={codeLanguage}
                    onLanguageChange={setCodeLanguage}
                  />
                ),
              },
            ]}
          />
        ) : (
          <BankOperations settings={settings} />
        )}
      </main>

      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onSave={handleSaveSettings}
      />
    </>
  )
}

export default App

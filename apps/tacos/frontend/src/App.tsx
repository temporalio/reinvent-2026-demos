import { useCallback, useEffect, useState } from 'react'
import { PanelViewport } from './components/PanelViewport'
import { MissionInsights } from './components/MissionInsights'
import ziggy from './kit/brand/ziggy-face.png'
import { Cart } from './components/Cart'
import { Checkout } from './components/Checkout'
import { KitchenDisplay } from './components/KitchenDisplay'
import { Menu } from './components/Menu'
import { OrderTracker } from './components/OrderTracker'
import { SettingsModal } from './components/SettingsModal'
import { pathLabel } from './data/scenarios'
import { useSSE } from './hooks/useSSE'
import temporalLogo from './kit/brand/temporal-logo.svg'
import type {
  CartItem,
  CreateOrderResponse,
  MenuItem,
  PhoneScreen,
  Settings,
  TemporalUiInfo,
} from './types'

const DEFAULT_SETTINGS: Settings = {
  mode: 'temporal',
  failure_scenario: 'store_connectivity',
  presentation_mode: 'detailed',
  worker_language: 'python',
}

function App() {
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [storeOnline, setStoreOnline] = useState<boolean | null>(null)
  const [screen, setScreen] = useState<PhoneScreen>('menu')
  const [cart, setCart] = useState<CartItem[]>([])
  const [orderId, setOrderId] = useState<string | null>(null)
  const [isOrdering, setIsOrdering] = useState(false)
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [temporalUi, setTemporalUi] = useState<TemporalUiInfo | null>(null)
  const [temporalWorkflowUrl, setTemporalWorkflowUrl] = useState<string | null>(null)
  const [workflowId, setWorkflowId] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const { events, finalStatus, interrupted, reset: resetSSE } = useSSE(orderId)

  // Load settings from backend on mount
  useEffect(() => {
    const read = async (path: string) => {
      const response = await fetch(path)
      if (!response.ok) throw new Error('Configuration unavailable')
      return response.json()
    }
    Promise.all([
      read('/dejavutacos/api/settings'),
      read('/dejavutacos/api/worker-language'),
      read('/dejavutacos/api/temporal-ui'),
    ]).then(([backendSettings, langData, temporalUiData]) => {
      setSettings((prev) => ({
        ...prev,
        ...backendSettings,
        worker_language: langData.language || 'python',
      }))
      if (temporalUiData?.namespace_url) {
        setTemporalUi(temporalUiData)
      }
    }).catch(() => setError('Demo settings could not be loaded. Check the API connection and reload.'))
  }, [])

  const handleSaveSettings = useCallback(
    async (newSettings: Settings) => {
      if (saving) return
      setSaving(true)
      setError(null)
      try {
        const backendSettings = { mode: newSettings.mode, failure_scenario: newSettings.failure_scenario, presentation_mode: newSettings.presentation_mode }
        const response = await fetch('/dejavutacos/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(backendSettings),
        })
        if (!response.ok) throw new Error('Settings request failed')
        setSettings(newSettings)
        setOrderId(null)
        setTemporalWorkflowUrl(null)
        setWorkflowId(null)
        setScreen('menu')
        setCart([])
        resetSSE()
      } catch {
        setError('Settings could not be saved. Check the API connection before trying again.')
      } finally {
        setSaving(false)
      }
    },
    [resetSSE, saving]
  )

  const handleAddToCart = useCallback((item: MenuItem) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.menu_item_id === item.id)
      if (existing) {
        return prev.map((c) =>
          c.menu_item_id === item.id ? { ...c, quantity: c.quantity + 1 } : c
        )
      }
      return [
        ...prev,
        { menu_item_id: item.id, name: item.name, quantity: 1, price: item.price },
      ]
    })
  }, [])

  const handleUpdateQuantity = useCallback(
    (menuItemId: string, delta: number) => {
      setCart((prev) =>
        prev
          .map((c) =>
            c.menu_item_id === menuItemId
              ? { ...c, quantity: c.quantity + delta }
              : c
          )
          .filter((c) => c.quantity > 0)
      )
    },
    []
  )

  const handlePlaceOrder = useCallback(async () => {
    setIsOrdering(true)
    setError(null)
    try {
      const res = await fetch('/dejavutacos/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: cart }),
      })
      if (!res.ok) throw new Error('Order request failed')
      const data = (await res.json()) as CreateOrderResponse
      setOrderId(data.order_id)
      setTemporalWorkflowUrl(data.temporal_ui_url || null)
      setWorkflowId(data.workflow_id || null)
      setScreen('tracking')
    } catch {
      setError('The order could not be confirmed. Check the connection before placing another order.')
    } finally {
      setIsOrdering(false)
    }
  }, [cart])

  const handleNewOrder = useCallback(() => {
    setOrderId(null)
    setTemporalWorkflowUrl(null)
    setWorkflowId(null)
    setCart([])
    setScreen('menu')
    resetSSE()
  }, [resetSSE])

  const renderPhoneContent = () => {
    switch (screen) {
      case 'menu':
        return (
          <Menu
            cart={cart}
            onAddToCart={handleAddToCart}
            onViewCart={() => setScreen('cart')}
          />
        )
      case 'cart':
        return (
          <Cart
            items={cart}
            onUpdateQuantity={handleUpdateQuantity}
            onCheckout={() => setScreen('checkout')}
            onBack={() => setScreen('menu')}
          />
        )
      case 'checkout':
        return (
          <Checkout
            items={cart}
            onPlaceOrder={handlePlaceOrder}
            onBack={() => setScreen('cart')}
            isLoading={isOrdering}
          />
        )
      case 'tracking':
        return (
          <OrderTracker
            events={events}
            finalStatus={finalStatus}
            settings={settings}
            onNewOrder={handleNewOrder}
          />
        )
    }
  }

  return (
    <div className="taqueria-shell">
      <header className="mission-header">
        <div className="mission-brand"><img src={temporalLogo} alt="Temporal" /><span>CRASH COURSE / SECTOR 03</span></div>
        <p className="eyebrow">Durable orders. Across the galaxy.</p>
        <h1>ZIGGY SPACE<br className="narrow-break" /> TAQUERIA</h1>
        <div className="mission-rule"><span>ORDER / DISCONNECT / RECOVER</span><i aria-hidden="true" /></div>
        <button className="mission-options" onClick={() => setSettingsOpen(true)} aria-haspopup="dialog" disabled={saving}>
          {saving ? 'Saving…' : pathLabel(settings)} · Demo options
        </button>
      </header>
      {(error || interrupted) && <div className="mission-notices">
      {error && <div className="mission-error" role="alert">{error}<button onClick={() => setError(null)} aria-label="Dismiss error">×</button></div>}
      {interrupted && <p className="mission-error" role="alert">Live order updates stopped. The Workflow may still be running; inspect it in the Temporal UI before starting another order.</p>}
      </div>}
      <main className="mission-workspace">
        <div className="mission-top">
          <section className="mission-panel customer-panel" aria-labelledby="customer-title">
            <header className="panel-label"><span>01 / ORDER STATION</span><h2 id="customer-title">Your mission: tacos</h2></header>
            <PanelViewport label="Order station"><div className="customer-app">{renderPhoneContent()}</div></PanelViewport>
          </section>
          <section className="mission-panel kitchen-panel" aria-labelledby="kitchen-title">
            <header className="panel-label"><span>02 / MISSION CONTROL</span><h2 id="kitchen-title">Kitchen uplink</h2></header>
            <PanelViewport label="Kitchen uplink"><KitchenDisplay onOnlineChange={setStoreOnline} /></PanelViewport>
          </section>
        </div>
        <MissionInsights events={events} finalStatus={finalStatus} settings={settings} workflowId={workflowId}
          temporalUi={temporalUi} temporalWorkflowUrl={temporalWorkflowUrl} storeOnline={storeOnline} />
      </main>
      <footer className="mission-footer"><span>POWERED BY TEMPORAL</span><span>re:Invent 2026</span>
        <a href="/config" aria-label="Booth settings (staff)"><img src={ziggy} alt="" /><span>Config</span></a>
      </footer>
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} settings={settings} onSave={handleSaveSettings} busy={saving} />
    </div>
  )
}

export default App

import { useEffect, useRef, useState } from 'react'

interface StoreOrder {
  order_id: string
  items: { name: string; quantity: number }[]
  status: string
}

export function KitchenDisplay({ onOnlineChange }: { onOnlineChange: (online: boolean | null) => void }) {
  const [orders, setOrders] = useState<StoreOrder[]>([])
  const [online, setOnline] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const revision = useRef(0)
  const refresh = useRef<() => Promise<void>>(async () => {})

  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    async function read() {
      const request = ++revision.current
      try {
        const responses = await Promise.all(['/dejavutacos/api/store/orders', '/dejavutacos/api/store/status'].map((url) => fetch(url, { signal: controller.signal })))
        if (responses.some((response) => !response.ok)) throw new Error('Kitchen unavailable')
        const [nextOrders, status] = await Promise.all(responses.map((response) => response.json()))
        if (controller.signal.aborted || request !== revision.current) return
        setOrders(nextOrders)
        setOnline(status.online)
        onOnlineChange(status.online)
        setError(null)
      } catch {
        if (controller.signal.aborted || request !== revision.current) return
        setOnline(null)
        onOnlineChange(null)
        setError('Kitchen status unavailable. Check the API connection.')
      }
    }
    refresh.current = read
    async function poll() {
      await read()
      if (!controller.signal.aborted) timer = setTimeout(poll, 2000)
    }
    void poll()
    return () => { controller.abort(); clearTimeout(timer) }
  }, [onOnlineChange])

  async function act(path: string) {
    if (busy) return
    ++revision.current
    setBusy(true)
    try {
      const response = await fetch(path, { method: 'POST' })
      if (!response.ok) throw new Error('Kitchen command failed')
      await refresh.current()
    } catch {
      setError('Command not confirmed. Check kitchen status before trying again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="kitchen-content">
      <div className="uplink" data-state={online === null ? 'unknown' : online ? 'online' : 'offline'}>
        <span className="uplink-orbit" aria-hidden="true">⌁</span>
        <p className="eyebrow">SIMULATED KITCHEN CONNECTION</p>
        <h3>{online === null ? 'Checking uplink' : online ? 'Uplink restored' : 'Lost in space?'}</h3>
        <p>{online === false ? 'The kitchen cannot receive orders. Restore the uplink to let the next retry through.' : online ? 'Orders can reach Dock 42. Cut the uplink to introduce an outage.' : 'Waiting for a response from mission control.'}</p>
        <button className="mission-button" disabled={busy} onClick={() => void act(online === true ? '/dejavutacos/api/store/go-offline' : '/dejavutacos/api/store/go-online')}>
          {busy ? 'Sending command…' : online === true ? 'Cut kitchen uplink' : 'Restore kitchen uplink'} <span aria-hidden="true">↗</span>
        </button>
        <p className="mission-note">This switch simulates a store outage. It does not disconnect this Mac.</p>
      </div>
      {error && <p className="mission-error" role="alert">{error}</p>}
      <div className="kitchen-orders" aria-label="Kitchen orders">
        <p className="eyebrow">DOCK 42 / ORDER QUEUE</p>
        {orders.length === 0 && <p className="mission-empty">No orders at the dock yet.<br />Place an order at the station on the left.</p>}
        {orders.map((order) => (
          <article className="kitchen-order" key={order.order_id}>
            <div className="order-heading"><h3>#{order.order_id.slice(0, 6).toUpperCase()}</h3><span>{order.status}</span></div>
            {order.items.map((item, index) => <p key={index}>{item.quantity} × {item.name}</p>)}
            {(order.status === 'pending' || order.status === 'preparing') && <button className="mission-button" disabled={busy || online !== true} onClick={() => void act(`/dejavutacos/api/store/order-ready/${order.order_id}`)}>Mark Ready <span aria-hidden="true">✓</span></button>}
          </article>
        ))}
      </div>
    </div>
  )
}

import { useCallback, useEffect, useRef, useState } from 'react'
import type { OrderEvent } from '../types'

export function useSSE(orderId: string | null) {
  const [events, setEvents] = useState<OrderEvent[]>([])
  const [finalStatus, setFinalStatus] = useState<string | null>(null)
  const [interrupted, setInterrupted] = useState(false)
  const sourceRef = useRef<EventSource | null>(null)

  useEffect(() => {
    if (!orderId) return

    const source = new EventSource(`/dejavutacos/api/orders/${orderId}/events`)
    sourceRef.current = source

    source.addEventListener('order_update', (e) => {
      const event: OrderEvent = JSON.parse(e.data)
      setEvents((prev) => [...prev, event])
    })

    source.addEventListener('order_complete', (e) => {
      const data = JSON.parse(e.data)
      setFinalStatus(data.final_status)
      source.close()
    })

    source.addEventListener('timeout', () => {
      setInterrupted(true)
      source.close()
    })

    source.onerror = () => {
      setInterrupted(true)
      source.close()
    }

    return () => {
      source.close()
      sourceRef.current = null
    }
  }, [orderId])

  const reset = useCallback(() => {
    sourceRef.current?.close()
    setEvents([])
    setFinalStatus(null)
    setInterrupted(false)
  }, [])

  return { events, finalStatus, interrupted, reset }
}

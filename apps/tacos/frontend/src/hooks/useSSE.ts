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
      if (sourceRef.current !== source) return
      const event: OrderEvent = JSON.parse(e.data)
      if (event.order_id !== orderId) return
      setEvents((prev) => [...prev, event])
    })

    source.addEventListener('order_complete', (e) => {
      if (sourceRef.current !== source) return
      const data = JSON.parse(e.data)
      setFinalStatus(data.final_status)
      source.close()
    })

    source.addEventListener('timeout', () => {
      if (sourceRef.current !== source) return
      setInterrupted(true)
      source.close()
    })

    source.onerror = () => {
      if (sourceRef.current !== source) return
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
    sourceRef.current = null
    setEvents([])
    setFinalStatus(null)
    setInterrupted(false)
  }, [])

  return { events, finalStatus, interrupted, reset }
}

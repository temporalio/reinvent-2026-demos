import type { OrderEvent } from '../types'

export type InsightTab = 'business' | 'architecture' | 'code' | 'temporal'
export type Persona = 'captain' | 'mech' | 'envoy' | 'solarian'
export const personaTabs: Record<Persona, InsightTab> = { captain: 'business', mech: 'code', envoy: 'architecture', solarian: 'business' }
export function initialPersona(search: string): Persona {
  const value = new URLSearchParams(search).get('persona')
  return value && Object.hasOwn(personaTabs, value) ? value as Persona : 'captain'
}
export function safeUiUrl(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null
  } catch { return null }
}
export function isLoopbackUrl(value: string | null): boolean {
  if (!value) return false
  return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(value).hostname)
}
export function latestStep(events: OrderEvent[], step: string): OrderEvent | undefined {
  return events.findLast((event) => event.step === step)
}
export function paymentLabel(events: OrderEvent[]): string {
  if (latestStep(events, 'release_payment_hold')?.status === 'completed') return 'Hold released'
  if (latestStep(events, 'capture_payment')?.status === 'completed') return 'Payment captured'
  if (latestStep(events, 'authorize_payment')?.status === 'completed') return 'Payment held'
  return 'No confirmed hold'
}

/** Embed only the booth's same-origin local proxy. Keep direct/Cloud links external. */
export function localFrameUrl(value: string | null, origin: string): string | null {
  const safe = safeUiUrl(value)
  const safeOrigin = safeUiUrl(origin)
  if (!safe || !safeOrigin) return null
  const hosted = new URL(safe)
  const currentOrigin = new URL(safeOrigin)
  if (hosted.origin === currentOrigin.origin && hosted.pathname.startsWith('/_temporal/')) return hosted.href
  if (!isLoopbackUrl(safe) || !isLoopbackUrl(safeOrigin)) return null
  const target = new URL(safe)
  const current = new URL(safeOrigin)
  if (target.protocol !== current.protocol || target.port !== current.port || !target.pathname.startsWith('/temporal-ui/')) return null
  return new URL(target.pathname + target.search + target.hash, current.origin).href
}

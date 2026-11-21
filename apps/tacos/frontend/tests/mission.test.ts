import assert from 'node:assert/strict'
import { test } from 'node:test'
import { initialPersona, isLoopbackUrl, localFrameUrl, latestStep, paymentLabel, personaTabs, safeUiUrl } from '../src/lib/mission.ts'
import { orderStepStatus } from '../src/lib/stepStatus.ts'
import type { OrderEvent } from '../src/types/index.ts'

function event(step: string, status: OrderEvent['status'], attempt = 1): OrderEvent {
  return { order_id: 'test-order', step, status, attempt, max_attempts: 10, error: null, detail: '', timestamp: '2026-11-19T00:00:00Z', mode: 'temporal' }
}
test('persona defaults do not treat Space Wizard as a persona', () => {
  assert.equal(personaTabs[initialPersona('?persona=mech')], 'code')
  assert.equal(personaTabs[initialPersona('?persona=envoy')], 'architecture')
  assert.equal(personaTabs[initialPersona('?persona=solarian')], 'business')
  for (const input of ['', '?persona=space-wizard', '?persona=__proto__', '?persona=constructor']) {
    assert.equal(initialPersona(input), 'captain')
  }
})
test('Temporal links permit actual HTTP addresses, refuse scripts and embedded credentials', () => {
  for (const input of ['javascript:alert(1)', 'data:text/html,test', '/relative', 'https://key:secret@localhost/', 'not a URL', null]) assert.equal(safeUiUrl(input), null)
  assert.equal(safeUiUrl('https://cloud.temporal.io/namespaces/booth/workflows'), 'https://cloud.temporal.io/namespaces/booth/workflows')
  assert.equal(isLoopbackUrl(safeUiUrl('http://localhost:18233/namespaces/default/workflows')), true)
  assert.equal(isLoopbackUrl(safeUiUrl('http://127.0.0.1:18233/')), true)
  assert.equal(isLoopbackUrl(safeUiUrl('https://localhost.example.com/')), false)
  assert.equal(isLoopbackUrl(safeUiUrl('https://cloud.temporal.io/')), false)
})
test('a failed capture is not a charge and a failed release is not a refund', () => {
  const hold = [event('authorize_payment', 'completed')]
  assert.equal(paymentLabel([]), 'No confirmed hold')
  assert.equal(paymentLabel([event('authorize_payment', 'failed')]), 'No confirmed hold')
  assert.equal(paymentLabel([...hold, event('submit_to_store', 'retrying', 4)]), 'Payment held')
  assert.equal(paymentLabel([...hold, event('capture_payment', 'failed')]), 'Payment held')
  assert.equal(paymentLabel([...hold, event('release_payment_hold', 'failed')]), 'Payment held')
  assert.equal(paymentLabel([...hold, event('capture_payment', 'completed')]), 'Payment captured')
  assert.equal(paymentLabel([...hold, event('release_payment_hold', 'completed')]), 'Hold released')
})
test('the latest kitchen attempt wins over earlier failures', () => {
  const events = [event('submit_to_store', 'retrying', 1), event('submit_to_store', 'retrying', 2), event('submit_to_store', 'completed', 3)]
  assert.equal(latestStep(events, 'submit_to_store')?.status, 'completed')
  assert.equal(latestStep(events, 'submit_to_store')?.attempt, 3)
})

test('local iframe uses the same origin proxy without rewriting Cloud or other ports', () => {
  assert.equal(localFrameUrl('http://localhost:15310/temporal-ui/namespaces/default/workflows/order-1', 'http://127.0.0.1:15310'), 'http://127.0.0.1:15310/temporal-ui/namespaces/default/workflows/order-1')
  for (const url of ['https://cloud.temporal.io/namespaces/demo/workflows', 'http://localhost:18233/temporal-ui/', 'http://localhost:15310/not-temporal/', 'http://localhost.example.com:15310/temporal-ui/']) {
    assert.equal(localFrameUrl(url, 'http://127.0.0.1:15310'), null)
  }
})

test('a terminal order cannot keep displaying a retry or an infinite kitchen wait', () => {
  const stopped = [event('authorize_payment', 'completed'), event('submit_to_store', 'retrying', 10), event('release_payment_hold', 'completed')]
  assert.equal(orderStepStatus('submit_to_store', stopped), 'retrying')
  assert.equal(orderStepStatus('submit_to_store', stopped, 'refunded'), 'failed')
  assert.equal(orderStepStatus('release_payment_hold', stopped, 'refunded'), 'completed')
  const accepted = [event('submit_to_store', 'completed')]
  assert.equal(orderStepStatus('order_ready', accepted), 'waiting')
  assert.equal(orderStepStatus('order_ready', accepted, 'completed'), 'skipped')
})

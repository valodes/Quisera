// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createQuitoqueClient } from './quitoque/client.js'

const recipeProduct = {
  id: 51,
  code: 'TEST-51',
  name: 'Recette contractuelle',
  description: 'Description réelle de test.',
  total_time: '25 min',
  family: { recipe: 'recipe' },
  nutri_score: null,
}

function createFetch() {
  const requested: string[] = []
  const fetchImplementation: typeof fetch = async (input) => {
    const url = new URL(String(input))
    requested.push(url.pathname + url.search)
    if (url.pathname.endsWith('/shop/authentication-token')) {
      return Response.json({ token: 'test-token' })
    }
    if (url.pathname.endsWith('/shop/orders')) {
      return Response.json([
        {
          id: 9,
          tokenValue: 'private-order-token',
          deliveryDate: '2026-11-18 00:00:00',
          periodStartDate: '2026-11-16',
          periodEndDate: '2026-11-23',
        },
      ])
    }
    if (url.pathname.endsWith('/shop/orders/private-order-token/items')) {
      return Response.json([
        {
          id: 88,
          quantity: 2,
          productName: 'Recette contractuelle',
          variant: {
            product: {
              id: 51,
              attributes: [{ code: 'family', value: ['recipe'] }],
            },
          },
        },
      ])
    }
    if (url.pathname.includes('/shop/products/2026-11-16/2026-11-23')) {
      return Response.json({
        products: [recipeProduct],
        paginator: { nbPages: 1 },
      })
    }
    if (url.pathname.endsWith('/shop/products/TEST-51'))
      return Response.json({ images: [] })
    return new Response(null, { status: 404 })
  }
  return { fetchImplementation, requested }
}

function capture<T>(promise: Promise<T>) {
  return promise.then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  )
}

describe('Quitoque delivery contracts', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('allows slow order responses to complete within the upstream budget', async () => {
    vi.useFakeTimers()
    const fetchImplementation: typeof fetch = async (input, init) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith('/shop/authentication-token'))
        return Response.json({ token: 'test-token' })
      return new Promise((resolve, reject) => {
        const timer = setTimeout(
          () =>
            resolve(
              Response.json([
                {
                  id: 9,
                  deliveryDate: '2026-11-18 00:00:00',
                },
              ]),
            ),
          35_000,
        )
        init?.signal?.addEventListener(
          'abort',
          () => {
            clearTimeout(timer)
            reject(new DOMException('Aborted', 'AbortError'))
          },
          { once: true },
        )
      })
    }
    const client = createQuitoqueClient({
      email: 'test@example.invalid',
      password: 'test-password',
      fetchImplementation,
    })

    const result = capture(client.listDeliveries())
    await vi.advanceTimersByTimeAsync(35_000)
    const outcome = await result
    expect(outcome.ok).toBe(true)
    if (outcome.ok) expect(outcome.value).toHaveLength(1)
  })

  it('retries a transient 503 after its Retry-After delay', async () => {
    vi.useFakeTimers()
    let attempts = 0
    const fetchImplementation: typeof fetch = async (input) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith('/shop/authentication-token'))
        return Response.json({ token: 'test-token' })
      attempts += 1
      if (attempts === 1)
        return new Response(null, {
          status: 503,
          headers: { 'retry-after': '1' },
        })
      return Response.json([{ id: 9, deliveryDate: '2026-11-18 00:00:00' }])
    }
    const client = createQuitoqueClient({
      email: 'test@example.invalid',
      password: 'test-password',
      fetchImplementation,
    })

    const result = capture(client.listDeliveries())
    await vi.advanceTimersByTimeAsync(1_000)
    const outcome = await result
    expect(outcome.ok).toBe(true)
    if (outcome.ok) expect(outcome.value).toHaveLength(1)
    expect(attempts).toBe(2)
  })

  it('retries one transient network failure', async () => {
    vi.useFakeTimers()
    let attempts = 0
    const fetchImplementation: typeof fetch = async (input) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith('/shop/authentication-token'))
        return Response.json({ token: 'test-token' })
      attempts += 1
      if (attempts === 1) throw new TypeError('fetch failed')
      return Response.json([{ id: 9, deliveryDate: '2026-11-18 00:00:00' }])
    }
    const client = createQuitoqueClient({
      email: 'test@example.invalid',
      password: 'test-password',
      fetchImplementation,
    })

    const result = capture(client.listDeliveries())
    await vi.advanceTimersByTimeAsync(500)
    const outcome = await result
    expect(outcome.ok).toBe(true)
    if (outcome.ok) expect(outcome.value).toHaveLength(1)
    expect(attempts).toBe(2)
  })

  it('does not retry a non-transient authorization response', async () => {
    let attempts = 0
    const fetchImplementation: typeof fetch = async (input) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith('/shop/authentication-token'))
        return Response.json({ token: 'test-token' })
      attempts += 1
      return new Response(null, { status: 401 })
    }
    const client = createQuitoqueClient({
      email: 'test@example.invalid',
      password: 'test-password',
      fetchImplementation,
    })

    await expect(client.listDeliveries()).rejects.toThrow('HTTP 401')
    expect(attempts).toBe(1)
  })

  it('keeps the request timeout active while reading a response body', async () => {
    vi.useFakeTimers()
    const orderSignals: AbortSignal[] = []
    let attempts = 0
    const fetchImplementation: typeof fetch = async (input, init) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith('/shop/authentication-token'))
        return Response.json({ token: 'test-token' })
      attempts += 1
      if (attempts > 1)
        return Response.json([{ id: 9, deliveryDate: '2026-11-18 00:00:00' }])

      const signal = init?.signal as AbortSignal
      orderSignals.push(signal)
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          signal.addEventListener(
            'abort',
            () => controller.error(new DOMException('Aborted', 'AbortError')),
            { once: true },
          )
        },
      })
      return new Response(body, {
        headers: { 'content-type': 'application/json' },
      })
    }
    const client = createQuitoqueClient({
      email: 'test@example.invalid',
      password: 'test-password',
      fetchImplementation,
    })

    const result = capture(client.listDeliveries())
    await vi.advanceTimersByTimeAsync(45_500)
    const outcome = await result
    expect(outcome.ok).toBe(true)
    if (outcome.ok) expect(outcome.value).toHaveLength(1)
    expect(orderSignals[0]?.aborted).toBe(true)
    expect(attempts).toBe(2)
  })

  it('bounds retries by the overall operation deadline', async () => {
    vi.useFakeTimers()
    let attempts = 0
    const fetchImplementation: typeof fetch = async (input, init) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith('/shop/authentication-token'))
        return Response.json({ token: 'test-token' })
      attempts += 1
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () => reject(new DOMException('Aborted', 'AbortError')),
          { once: true },
        )
      })
    }
    const client = createQuitoqueClient({
      email: 'test@example.invalid',
      password: 'test-password',
      fetchImplementation,
    })

    const result = capture(client.listDeliveries())
    await vi.advanceTimersByTimeAsync(120_000)
    const outcome = await result
    expect(outcome.ok).toBe(false)
    expect(attempts).toBe(3)
  })

  it('reads actual delivery dates and selected recipe occurrences without mass importing', async () => {
    const fetcher = createFetch()
    const client = createQuitoqueClient({
      email: 'test@example.invalid',
      password: 'test-password',
      fetchImplementation: fetcher.fetchImplementation,
    })
    expect(await client.listDeliveries()).toEqual([
      {
        externalOrderId: '9',
        deliveryDate: '2026-11-18 00:00:00',
        periodStartDate: '2026-11-16',
        periodEndDate: '2026-11-23',
      },
    ])
    const selected = await client.listSelectedRecipes('9')
    expect(
      selected.map(
        ({ title, sourceItemId, sourcePosition, occurrence, quantity }) => ({
          title,
          sourceItemId,
          sourcePosition,
          occurrence,
          quantity,
        }),
      ),
    ).toEqual([
      {
        title: 'Recette contractuelle',
        sourceItemId: '88',
        sourcePosition: 0,
        occurrence: 0,
        quantity: 2,
      },
      {
        title: 'Recette contractuelle',
        sourceItemId: '88',
        sourcePosition: 0,
        occurrence: 1,
        quantity: 2,
      },
    ])
    expect(
      fetcher.requested.some((path) =>
        path.startsWith('/api/v2/shop/products/2026-11-16/2026-11-23?'),
      ),
    ).toBe(true)
  })
})

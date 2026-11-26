import { LRUCache } from 'lru-cache'

export type QuitoqueSharedSession = {
  token: string
  customerPath: string | null
}

const sessionCache = new LRUCache<string, QuitoqueSharedSession>({
  max: 8,
  ttl: 10 * 60_000,
})

const inflightLogins = new Map<string, Promise<QuitoqueSharedSession>>()

export function readSharedQuitoqueSession(email: string): QuitoqueSharedSession | undefined {
  return sessionCache.get(email.toLowerCase())
}

export function clearSharedQuitoqueSession(email: string, expectedToken?: string): void {
  const key = email.toLowerCase()
  if (!expectedToken || sessionCache.get(key)?.token === expectedToken) {
    sessionCache.delete(key)
  }
}

export async function getOrAuthenticateSharedQuitoqueSession(
  email: string,
  forceRefresh: boolean,
  authenticate: () => Promise<QuitoqueSharedSession>,
): Promise<{ session: QuitoqueSharedSession; fromCache: boolean }> {
  const key = email.toLowerCase()
  if (!forceRefresh) {
    const cached = sessionCache.get(key)
    if (cached) return { session: cached, fromCache: true }
  }

  let pending = inflightLogins.get(key)
  if (!pending) {
    pending = authenticate()
      .then((session) => {
        sessionCache.set(key, session)
        return session
      })
      .finally(() => {
        inflightLogins.delete(key)
      })
    inflightLogins.set(key, pending)
  }

  return { session: await pending, fromCache: false }
}

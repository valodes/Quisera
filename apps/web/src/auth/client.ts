import { createAuthClient } from 'better-auth/vue'

export const authClient = createAuthClient({
  baseURL: `${window.location.origin}/api/auth`,
})

export type CurrentUser = NonNullable<typeof authClient.$Infer.Session>['user']

export function safeReturnTo(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.startsWith('//')
  ) {
    return '/'
  }
  if (value.includes('\\') || value.includes('\r') || value.includes('\n'))
    return '/'
  try {
    const parsed = new URL(value, window.location.origin)
    return parsed.origin === window.location.origin
      ? `${parsed.pathname}${parsed.search}${parsed.hash}`
      : '/'
  } catch {
    return '/'
  }
}

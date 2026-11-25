import { z } from 'zod'

export * from './recipes.js'
export * from './planning.js'

export const emailSchema = z.string().trim().email()

export function isValidEmail(value: string): boolean {
  return emailSchema.safeParse(value).success
}

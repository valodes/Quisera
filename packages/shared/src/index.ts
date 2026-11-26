import { z } from 'zod'

export * from './dates.js'
export * from './email.js'
export * from './planning.js'
export * from './recipes.js'

export const emailSchema = z.string().trim().email()

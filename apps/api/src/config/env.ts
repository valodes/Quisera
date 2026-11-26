import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { z } from 'zod'

const envFilePath = resolve(process.cwd(), '../../.env')
if (existsSync(envFilePath)) {
  process.loadEnvFile(envFilePath)
}

const originSchema = z
  .string()
  .url()
  .refine((value) => new URL(value).origin === value, {
    message: 'Origins must not contain a path, query, or fragment',
  })

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    APP_URL: originSchema,
    TRUSTED_ORIGINS: z.string().min(1),
    BETTER_AUTH_SECRET: z.string().min(32),
    SQLITE_PATH: z.string().trim().min(1),
    QUITOQUE_MAIL: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().trim().email().optional(),
    ),
    QUITOQUE_MAIL_PASSWORD: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().min(1).optional(),
    ),
    RECIPE_UPLOAD_DIR: z.string().trim().min(1).default('../../data/recipe-photos'),
    SMTP_HOST: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().trim().min(1).optional(),
    ),
    SMTP_PORT: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.coerce.number().int().min(1).max(65535).optional(),
    ),
    SMTP_SECURE: z.preprocess((value) => {
      if (value === '' || value === undefined) return undefined
      if (typeof value === 'boolean') return value
      if (typeof value === 'string') return value.toLowerCase() === 'true'
      return value
    }, z.boolean().optional()),
    SMTP_USER: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().trim().min(1).optional(),
    ),
    SMTP_PASS: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().min(1).optional(),
    ),
    SMTP_FROM: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().trim().min(1).optional(),
    ),
    API_HOST: z.string().trim().min(1).default('127.0.0.1'),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    WEB_ASSETS_DIR: z.string().trim().min(1).optional(),
  })
  .superRefine((value, context) => {
    if (Boolean(value.QUITOQUE_MAIL) !== Boolean(value.QUITOQUE_MAIL_PASSWORD)) {
      context.addIssue({
        code: 'custom',
        path: ['QUITOQUE_MAIL'],
        message: 'Both Quitoque credentials must be configured together',
      })
    }
    if (Boolean(value.SMTP_USER) !== Boolean(value.SMTP_PASS)) {
      context.addIssue({
        code: 'custom',
        path: ['SMTP_USER'],
        message: 'Both SMTP_USER and SMTP_PASS must be configured together',
      })
    }
    if (value.SMTP_USER && !value.SMTP_HOST) {
      context.addIssue({
        code: 'custom',
        path: ['SMTP_HOST'],
        message: 'SMTP_HOST is required when SMTP credentials are configured',
      })
    }
    if (value.SMTP_HOST && !value.SMTP_FROM) {
      context.addIssue({
        code: 'custom',
        path: ['SMTP_FROM'],
        message: 'SMTP_FROM is required when SMTP_HOST is configured',
      })
    }
    const origins = value.TRUSTED_ORIGINS.split(',').map((origin) => origin.trim())
    const invalidOrigins = origins.filter((origin) => !originSchema.safeParse(origin).success)

    if (invalidOrigins.length > 0) {
      context.addIssue({
        code: 'custom',
        path: ['TRUSTED_ORIGINS'],
        message: 'Each trusted origin must be an origin URL without a path',
      })
    }

    if (!origins.includes(value.APP_URL)) {
      context.addIssue({
        code: 'custom',
        path: ['TRUSTED_ORIGINS'],
        message: 'APP_URL must be included in TRUSTED_ORIGINS',
      })
    }

    if (value.NODE_ENV === 'production' && !value.APP_URL.startsWith('https://')) {
      context.addIssue({
        code: 'custom',
        path: ['APP_URL'],
        message: 'APP_URL must use HTTPS in production',
      })
    }
  })

export type AppEnvironment = Omit<z.infer<typeof environmentSchema>, 'TRUSTED_ORIGINS'> & {
  TRUSTED_ORIGINS: string[]
}

export function parseEnvironment(source: NodeJS.ProcessEnv = process.env): AppEnvironment {
  const result = environmentSchema.safeParse(source)

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`)
      .join('; ')

    throw new Error(`Invalid Quisera API configuration: ${details}`)
  }

  return {
    ...result.data,
    TRUSTED_ORIGINS: result.data.TRUSTED_ORIGINS.split(',').map((origin) => origin.trim()),
  }
}

import nodemailer from 'nodemailer'
import type { AppEnvironment } from '../config/env.js'

export type PasswordResetMailPayload = {
  to: string
  name: string
  resetUrl: string
}

export type Mailer = {
  sendPasswordResetEmail(payload: PasswordResetMailPayload): Promise<void>
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function createMailer(environment: AppEnvironment): Mailer {
  const transporter = environment.SMTP_HOST
    ? nodemailer.createTransport({
        host: environment.SMTP_HOST,
        port: environment.SMTP_PORT ?? 587,
        secure: environment.SMTP_SECURE ?? false,
        auth:
          environment.SMTP_USER && environment.SMTP_PASS
            ? {
                user: environment.SMTP_USER,
                pass: environment.SMTP_PASS,
              }
            : undefined,
      })
    : null

  return {
    async sendPasswordResetEmail({ to, name, resetUrl }) {
      if (!transporter || !environment.SMTP_FROM) {
        if (environment.NODE_ENV === 'development') {
          console.info(`[Quisera dev] Lien de réinitialisation pour ${to} : ${resetUrl}`)
        } else if (environment.NODE_ENV === 'production') {
          console.warn('Password reset requested but SMTP is not configured; no email was sent.')
        }
        return
      }

      const greeting = name.trim() ? `Bonjour ${name.trim()},` : 'Bonjour,'
      const safeGreeting = escapeHtml(greeting)
      const safeUrl = escapeHtml(resetUrl)

      await transporter.sendMail({
        from: environment.SMTP_FROM,
        to,
        subject: 'Réinitialiser votre mot de passe · Quisera',
        text: [
          greeting,
          '',
          'Vous avez demandé la réinitialisation de votre mot de passe Quisera.',
          'Utilisez le lien ci-dessous pour en choisir un nouveau (valable 1 heure) :',
          '',
          resetUrl,
          '',
          "Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet e-mail.",
        ].join('\n'),
        html: [
          `<p>${safeGreeting}</p>`,
          '<p>Vous avez demandé la réinitialisation de votre mot de passe Quisera.</p>',
          `<p><a href="${safeUrl}">Choisir un nouveau mot de passe</a> (lien valable 1 heure).</p>`,
          "<p>Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet e-mail.</p>",
        ].join(''),
      })
    },
  }
}

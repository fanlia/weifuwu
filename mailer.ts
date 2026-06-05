import { createTransport } from 'nodemailer'
import type { Transporter } from 'nodemailer'

export interface MailOptions {
  to: string | string[]
  subject: string
  text?: string
  html?: string
  from?: string
  cc?: string | string[]
  bcc?: string | string[]
}

export interface MailerOptions {
  transport?: string | Transporter
  from?: string
  send?: (opts: MailOptions) => Promise<void>
}

export interface Mailer {
  send: (opts: MailOptions) => Promise<void>
  close: () => Promise<void>
}

export function mailer(options: MailerOptions): Mailer {
  const sender = options.send
  const from = options.from

  let transporter: Transporter | null = null
  if (!sender && options.transport) {
    transporter = typeof options.transport === 'string'
      ? createTransport(options.transport)
      : options.transport
  }

  async function send(opts: MailOptions): Promise<void> {
    if (sender) {
      await sender(opts)
      return
    }
    if (!transporter) {
      throw new Error('mailer: no transport configured — provide `transport` or `send` option')
    }
    await transporter.sendMail({ ...opts, from: opts.from ?? from })
  }

  async function close(): Promise<void> {
    transporter?.close()
  }

  return { send, close }
}

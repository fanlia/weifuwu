import { createTransport } from 'nodemailer'
import type { Transporter } from 'nodemailer'

/** Options for sending an email. */
export interface MailOptions {
  /** Recipient address(es). */
  to: string | string[]
  /** Email subject. */
  subject: string
  /** Plain text body. */
  text?: string
  /** HTML body. */
  html?: string
  /** Sender address (overrides `MailerOptions.from`). */
  from?: string
  /** CC recipient(s). */
  cc?: string | string[]
  /** BCC recipient(s). */
  bcc?: string | string[]
}

/** Options for {@link mailer}. */
export interface MailerOptions {
  /** Nodemailer transport string or pre-built transporter object. */
  transport?: string | Transporter
  /** Default sender address. */
  from?: string
  /** Custom send function (bypasses nodemailer). */
  send?: (opts: MailOptions) => Promise<void>
}

/** Mailer instance returned by {@link mailer}. */
export interface Mailer extends Closeable {
  /** Send an email. */
  send: (opts: MailOptions) => Promise<void>
  /** Close the nodemailer transport. */
  close: () => Promise<void>
}

/**
 * Create a mailer instance.
 *
 * ```ts
 * import { mailer } from 'weifuwu'
 *
 * const email = mailer({ transport: 'smtp://user:pass@smtp.example.com' })
 * await email.send({
 *   to: 'user@example.com',
 *   subject: 'Hello',
 *   text: 'Hello from weifuwu!',
 * })
 * await email.close()
 * ```
 */
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

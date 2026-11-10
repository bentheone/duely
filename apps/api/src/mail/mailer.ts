import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { config } from '../config';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export const MAILER = Symbol('MAILER');
export interface Mailer {
  /** False when SMTP_* env vars are missing — callers report that instead of failing silently. */
  readonly configured: boolean;
  send(msg: MailMessage): Promise<void>;
}

/** SMTP via nodemailer (e.g. Gmail + an app password — free). Logs recipients' domains only, never content. */
@Injectable()
export class SmtpMailer implements Mailer {
  private readonly log = new Logger('Mailer');
  private transport: Transporter | null = null;

  get configured(): boolean {
    return !!config().smtp;
  }

  async send(msg: MailMessage): Promise<void> {
    const smtp = config().smtp;
    if (!smtp) throw new Error('SMTP is not configured');
    this.transport ??= nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: { user: smtp.user, pass: smtp.pass },
    });
    await this.transport.sendMail({ from: smtp.from, ...msg });
    this.log.log(`sent "${msg.subject}" to *@${msg.to.split('@')[1] ?? '?'}`);
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Minimal branded email: white, ink text, one dark pill button — matches the app (§11). */
export function brandedEmail(opts: { title: string; lines: string[]; button?: { label: string; url: string } }): string {
  const lines = opts.lines.map((l) => `<p style="margin:0 0 14px;font-size:16px;line-height:24px;color:#111317">${esc(l)}</p>`).join('');
  const button = opts.button
    ? `<p style="margin:24px 0 0"><a href="${esc(opts.button.url)}" style="display:inline-block;background:#111317;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:14px 26px;border-radius:28px">${esc(opts.button.label)}</a></p>`
    : '';
  return `<!doctype html><html><body style="margin:0;background:#ffffff;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<div style="max-width:480px;margin:0 auto;padding:40px 28px">
  <div style="margin-bottom:32px"><span style="display:inline-block;width:22px;height:22px;border-radius:11px;background:#111317"></span><span style="display:inline-block;width:9px;height:9px;border-radius:5px;background:#EA580C;margin-left:-4px;vertical-align:top"></span>
  <span style="font-size:22px;font-weight:600;letter-spacing:-0.5px;color:#111317;margin-left:6px;vertical-align:4px">duely</span></div>
  <h1 style="margin:0 0 16px;font-size:26px;line-height:32px;font-weight:600;color:#111317">${esc(opts.title)}</h1>
  ${lines}${button}
  <p style="margin:40px 0 0;font-size:13px;color:#9CA0A8">You get this because you asked for access to Duely.</p>
</div></body></html>`;
}

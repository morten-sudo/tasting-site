// A small SMTP client for Cloudflare Functions: sends one email through the site's mail account
// (One.com: send.one.com, port 465 with TLS from the start). The account and its password are
// Cloudflare secrets (SMTP_USER, SMTP_PASS) – they are never in the code or the browser.

export interface MailEnv {
  SMTP_HOST?: string;
  SMTP_PORT?: string;
  SMTP_USER?: string;
  SMTP_PASS?: string;
  /** The sender address; the account itself when not set */
  SMTP_FROM?: string;
}

export type Mail = { to: string; subject: string; text: string; html: string; replyTo?: string | null; fromName: string };

/** A connection as Cloudflare's connect() gives it (and as the tests build it from a Node socket). */
export type Conn = { readable: ReadableStream<Uint8Array>; writable: WritableStream<Uint8Array>; close: () => unknown };

const enc = new TextEncoder();
const b64 = (s: string) => {
  let bin = '';
  for (const byte of enc.encode(s)) bin += String.fromCharCode(byte);
  return btoa(bin);
};
/** Base64 in lines of 76 characters, as email bodies must be */
const b64Lines = (s: string) => b64(s).replace(/.{1,76}/g, '$&\r\n');
/** A header value with non-ASCII characters (e.g. "Smagning på Æblegården") */
const headerWord = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`);
const clean = (s: string) => s.replace(/[\r\n]+/g, ' ').trim();

/** The whole message: plain text and HTML, both base64 encoded so long lines and æøå are safe. */
export function buildMessage(mail: Mail, from: string, now = new Date()) {
  const boundary = `wt-${crypto.randomUUID()}`;
  const domain = from.split('@')[1] ?? 'localhost';
  const headers = [
    `From: ${headerWord(clean(mail.fromName))} <${from}>`,
    `To: <${clean(mail.to)}>`,
    ...(mail.replyTo ? [`Reply-To: <${clean(mail.replyTo)}>`] : []),
    `Subject: ${headerWord(clean(mail.subject))}`,
    `Date: ${now.toUTCString().replace('GMT', '+0000')}`,
    `Message-ID: <${crypto.randomUUID()}@${domain}>`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];
  const part = (type: string, body: string) =>
    `--${boundary}\r\nContent-Type: ${type}; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${b64Lines(body)}`;
  return `${headers.join('\r\n')}\r\n\r\n${part('text/plain', mail.text)}${part('text/html', mail.html)}--${boundary}--\r\n`;
}

/** Talks SMTP over an open, encrypted connection and sends the message. Throws with the server's reply on failure. */
export async function smtpSend(conn: Conn, opts: { user: string; pass: string; from: string; to: string; message: string; helo?: string }) {
  const reader = conn.readable.getReader();
  const writer = conn.writable.getWriter();
  const dec = new TextDecoder();
  let buffer = '';

  // One reply: lines until one with a space after the code ("250 OK", not "250-SIZE")
  async function reply(): Promise<{ code: number; text: string }> {
    const lines: string[] = [];
    for (;;) {
      const nl = buffer.indexOf('\n');
      if (nl >= 0) {
        const line = buffer.slice(0, nl).replace(/\r$/, '');
        buffer = buffer.slice(nl + 1);
        lines.push(line);
        if (/^\d{3}( |$)/.test(line)) return { code: Number(line.slice(0, 3)), text: lines.join('\n') };
        continue;
      }
      const { value, done } = await reader.read();
      if (done) throw new Error(`smtp: connection closed (${lines.join(' | ')})`);
      buffer += dec.decode(value, { stream: true });
    }
  }
  async function step(line: string | null, want: number, label: string) {
    if (line != null) await writer.write(enc.encode(line + '\r\n'));
    const r = await reply();
    if (r.code !== want) throw new Error(`smtp ${label}: ${r.text}`);
    return r;
  }

  try {
    await step(null, 220, 'greeting');
    await step(`EHLO ${opts.helo ?? 'winetastr'}`, 250, 'ehlo');
    await step('AUTH LOGIN', 334, 'auth');
    await step(b64(opts.user), 334, 'auth user');
    await step(b64(opts.pass), 235, 'auth password');
    await step(`MAIL FROM:<${opts.from}>`, 250, 'mail from');
    await step(`RCPT TO:<${opts.to}>`, 250, 'rcpt to');
    await step('DATA', 354, 'data');
    // A line starting with a dot gets one more (the message ends with a line with a single dot)
    const body = opts.message.replace(/\r?\n/g, '\r\n').replace(/^\./gm, '..');
    await step(`${body}${body.endsWith('\r\n') ? '' : '\r\n'}.`, 250, 'message');
    await writer.write(enc.encode('QUIT\r\n')).catch(() => {});
  } finally {
    reader.releaseLock();
    writer.releaseLock();
    try { await conn.close(); } catch { /* already closed */ }
  }
}

/** Opens an encrypted connection (Cloudflare's connect() in the function). */
export type Open = (hostname: string, port: number) => Conn;

/** Sends one email with the site's account. Returns false when mail is not set up (no secrets). */
export async function sendMail(env: MailEnv, open: Open, mail: Mail): Promise<boolean> {
  if (!env.SMTP_USER || !env.SMTP_PASS) return false;
  // The sender: SMTP_FROM, or the login when that is an address (One.com); services like Resend log in with a plain user name
  const from = env.SMTP_FROM || (env.SMTP_USER.includes('@') ? env.SMTP_USER : 'noreply@winetastr.com');
  const conn = open(env.SMTP_HOST || 'send.one.com', Number(env.SMTP_PORT || 465));
  await smtpSend(conn, { user: env.SMTP_USER, pass: env.SMTP_PASS, from, to: mail.to, message: buildMessage(mail, from) });
  return true;
}

// The account's daily limits on emails and automatic look-ups (use_daily_quota in the database): at the limit a
// server function answers 429 { error: 'daily_limit', kind, limit }. These turn that answer into the words the host
// sees – under the field or in a toast, as the error would be shown anyway.
import { t } from '../i18n';

/** Thrown (or returned) when the account has reached today's limit; the message is the text to show. */
export class DailyLimitError extends Error {}

/** The text for a daily-limit answer whose body is already read, or null when it is something else */
export function dailyLimitOf(status: number, body: unknown): string | null {
  const b = body as { error?: string; kind?: string } | null;
  if (status !== 429 || b?.error !== 'daily_limit') return null;
  return t(b.kind === 'mail' ? 'limit.mailDaily' : 'limit.aiDaily');
}

/** The text for a daily-limit answer, or null when the response is something else (the body is left unread) */
export async function dailyLimitText(res: Response): Promise<string | null> {
  if (res.status !== 429 || res.bodyUsed) return null;
  return dailyLimitOf(res.status, await res.clone().json().catch(() => null));
}

/** Throws DailyLimitError for a daily-limit answer (for code that already turns a failed response into an error) */
export async function throwIfDailyLimit(res: Response) {
  const text = await dailyLimitText(res);
  if (text) throw new DailyLimitError(text);
}

/** The text to show for an error: the limit's own words, else the usual message */
export const limitOr = (e: unknown, fallback: string) => (e instanceof DailyLimitError ? e.message : fallback);

// When to try a waiting reading again (stage 7e; the app will do the same in 7f).
// The free quota of Gemini resets at midnight Pacific time; a busy service is tried again in a while.

export const RETRY_CODES = ['quota', 'overloaded', 'timeout', 'network'];
export const BUSY_RETRY_MS = 15 * 60_000;
export const AFTER_RESET_MS = 5 * 60_000;

const pacificParts = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Los_Angeles', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', hourCycle: 'h23',
});
function partsAt(ms) {
  const p = Object.fromEntries(pacificParts.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), h: Number(p.hour) };
}

/** First midnight in Los Angeles after `now` (ms), with summer time (UTC−7) or winter time (UTC−8). */
export function pacificMidnightAfter(now = Date.now()) {
  const { y, m, d } = partsAt(now);
  for (const offset of [7, 8]) {
    const t = Date.UTC(y, m - 1, d + 1, offset);
    const p = partsAt(t);
    if (p.h === 0 && t > now) return t;
  }
  return now + 24 * 3_600_000; // not reached; safe default
}

/**
 * Which limit a 429 answer of Gemini hit: 'day' (requests per day: wait for the reset), 'minute' (requests per
 * minute: wait a little) or null (not said). Gemini names it in error.details[].violations[].quotaId and may add
 * a RetryInfo with retryDelay ("37s").
 */
export function quotaLimit(body) {
  const details = body?.error?.details ?? [];
  const ids = details.flatMap((d) => d.violations ?? []).map((v) => String(v.quotaId ?? ''));
  if (ids.some((id) => /PerDay/i.test(id))) return { kind: 'day' };
  const delay = details.map((d) => /^(\d+(?:\.\d+)?)s$/.exec(String(d.retryDelay ?? ''))).find(Boolean);
  if (ids.some((id) => /PerMinute/i.test(id)) || delay) return { kind: 'minute', delayMs: delay ? Math.ceil(Number(delay[1]) * 1000) : 60_000 };
  return { kind: null };
}
export const MINUTE_EXTRA_MS = 5_000;

/**
 * Time (ms) of the next attempt after an error with this code, or null when it is not retried by itself
 * (bad key, blocked or broken answer: the person decides). body: the error answer, to tell the daily limit
 * from the per-minute one; an unknown 429 is tried again in 15 minutes (a failed call does not use quota).
 */
export function nextAttemptAt(code, now = Date.now(), body = null) {
  if (code === 'quota') {
    const limit = quotaLimit(body);
    if (limit.kind === 'minute') return now + limit.delayMs + MINUTE_EXTRA_MS;
    if (limit.kind === null && body) return now + BUSY_RETRY_MS;
    return pacificMidnightAfter(now) + AFTER_RESET_MS;
  }
  if (RETRY_CODES.includes(code)) return now + BUSY_RETRY_MS;
  return null;
}

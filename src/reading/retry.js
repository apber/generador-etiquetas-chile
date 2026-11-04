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
 * Time (ms) of the next attempt after an error with this code, or null when it is not retried by itself
 * (bad key, blocked or broken answer: the person decides).
 */
export function nextAttemptAt(code, now = Date.now()) {
  if (code === 'quota') return pacificMidnightAfter(now) + AFTER_RESET_MS;
  if (RETRY_CODES.includes(code)) return now + BUSY_RETRY_MS;
  return null;
}

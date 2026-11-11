// Arreglo 12 (10-11-2026): the instructions of the reading and the models cannot change without a new version,
// and a new version is used only after the expected readings are scored again (docs/lectura.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { PROMPT_VERSION, FOCUS_SECTIONS, readingPrompt } from '../src/reading/prompt.js';
import { TRANSCRIPTION_SCHEMA } from '../src/reading/schema.js';
import { DEFAULT_MODEL, FALLBACK_MODEL } from '../src/reading/gemini.js';

/**
 * One line per version of the instructions: fingerprint of the prompt and schema, the models, and its scoring
 * (date of the scoring of lectura-esperada and its silent errors; null = not scored yet). See docs/lectura.md.
 */
const VERSIONS = {
  4: { fingerprint: '6ced6e8128a05fce', models: ['gemini-3.6-flash', 'gemini-3.5-flash-lite'], scored: '2026-11-04' },
  5: { fingerprint: 'dba42cf51db011e6', models: ['gemini-3.6-flash', 'gemini-3.5-flash-lite'], scored: '2026-11-11' },
};

export function promptFingerprint() {
  const text = [
    readingPrompt({ productHint: 'X', imageCount: 2 }),
    ...Object.keys(FOCUS_SECTIONS).map((focus) => readingPrompt({ focus })),
    JSON.stringify(TRANSCRIPTION_SCHEMA),
  ].join('\n');
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

test('the instructions and models match the line of their version (change them → new version and a new scoring)', () => {
  const v = VERSIONS[PROMPT_VERSION];
  assert.ok(v, `PROMPT_VERSION ${PROMPT_VERSION} has no line in test/prompt.test.js: add it, with its fingerprint, and score lectura-esperada (docs/lectura.md).`);
  assert.equal(promptFingerprint(), v.fingerprint,
    `The instructions or the schema changed without raising PROMPT_VERSION (now ${PROMPT_VERSION}): raise it, add its line here and score lectura-esperada again before using it (docs/lectura.md).`);
  assert.deepEqual([DEFAULT_MODEL, FALLBACK_MODEL], v.models,
    'The model changed: score lectura-esperada again with the new one (docs/lectura.md) and update the line of this version.');
});

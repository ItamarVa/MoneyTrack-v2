/**
 * Pure matching core of the real-data leak guard (see check-real-data.mjs, MEM-PUB).
 * Turns the owner's real values into needles and finds them in repo text.
 * Invariants: real values live only in memory; reports carry masked values only;
 * the allowlist holds SHA-256 hashes of normalized values, never plaintext.
 */

import { createHash } from "node:crypto";

export const MIN_TEXT_LENGTH = 5;
export const MIN_DIGITS = 6;
const GRAM = MIN_TEXT_LENGTH;
const PHRASE_KINDS = new Set(["description", "memo"]);
const NUMBER_LIKE = /^[\d\s./-]+$/;
const DIGIT_RUN = /\d+(?:[-/]\d+)*/g;
const WORD_CHAR = /[\p{L}\p{N}]/u;

export function normalizeValue(value) {
  return String(value).toLowerCase().replace(/\s+/g, " ").trim();
}

function isNumberLike(normalized) {
  return NUMBER_LIKE.test(normalized) && /\d/.test(normalized);
}

/** Digits only, leading zeros dropped, so `012-345` and `12345` compare equal. */
function digitsKey(value) {
  return value.replace(/\D/g, "").replace(/^0+/, "");
}

/** Number keys for a value: the whole digit string plus each separated part. */
function numberKeys(normalized) {
  const parts = normalized.split(/[^\d]+/).map(digitsKey);
  return [...new Set([digitsKey(normalized), ...parts])].filter(
    (key) => key.length >= MIN_DIGITS,
  );
}

export function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** The string an allowlist hash is computed over, for `--hash` and for matching. */
export function allowlistKey(value) {
  const normalized = normalizeValue(value);
  return isNumberLike(normalized) ? digitsKey(normalized) : normalized;
}

/** Parses allowlist text: one 64-hex hash per line, `#` starts a comment. */
export function parseAllowlist(text) {
  const hashes = new Set();
  for (const raw of text.split(/\r?\n/)) {
    const entry = raw.replace(/#.*$/, "").trim().toLowerCase();
    if (!entry) continue;
    if (!/^[0-9a-f]{64}$/.test(entry)) {
      throw new Error(`Invalid allowlist entry (expected SHA-256 hex): ${entry.slice(0, 12)}...`);
    }
    hashes.add(entry);
  }
  return hashes;
}

/** Consecutive word pairs, so a payee name inside a longer descriptor still matches. */
export function wordPairs(normalized) {
  const words = normalized.split(" ");
  const pairs = [];
  for (let index = 0; index + 1 < words.length; index += 1) {
    pairs.push(`${words[index]} ${words[index + 1]}`);
  }
  return pairs;
}

function addText(texts, value, kind, allow) {
  if (value.length < MIN_TEXT_LENGTH || texts.has(value)) return;
  if (allow.has(sha256(value))) return;
  texts.set(value, kind);
}

/**
 * entries: [{ kind, value }] straight from the real data.
 * Returns { texts: Map<normalized, kind>, numbers: Map<digitsKey, kind> }.
 */
export function buildNeedles(entries, allow = new Set()) {
  const texts = new Map();
  const numbers = new Map();
  for (const { kind, value } of entries) {
    if (value === null || value === undefined) continue;
    const normalized = normalizeValue(value);
    if (isNumberLike(normalized)) {
      for (const key of numberKeys(normalized)) {
        if (!numbers.has(key) && !allow.has(sha256(key))) numbers.set(key, kind);
      }
      continue;
    }
    addText(texts, normalized, kind, allow);
    if (PHRASE_KINDS.has(kind)) {
      for (const pair of wordPairs(normalized)) addText(texts, pair, `${kind}-phrase`, allow);
    }
  }
  return { texts, numbers };
}

function gramSet(text) {
  const grams = new Set();
  for (let index = 0; index + GRAM <= text.length; index += 1) {
    grams.add(text.slice(index, index + GRAM));
  }
  return grams;
}

/** Whole-word occurrence; word pairs need it or `e bit` fires inside `mode bits`. */
function includesWord(line, value) {
  for (let at = line.indexOf(value); at !== -1; at = line.indexOf(value, at + 1)) {
    const before = line[at - 1] ?? " ";
    const after = line[at + value.length] ?? " ";
    if (!WORD_CHAR.test(before) && !WORD_CHAR.test(after)) return true;
  }
  return false;
}

function scanTextNeedles(path, lines, texts, hits) {
  const joined = lines.join("\n");
  // Cheap prefilter: a value can only occur if its first and last grams do.
  const grams = gramSet(joined);
  for (const [value, kind] of texts) {
    if (!grams.has(value.slice(0, GRAM)) || !grams.has(value.slice(-GRAM))) continue;
    if (!joined.includes(value)) continue;
    const matches = kind.endsWith("-phrase") ? includesWord : (line, v) => line.includes(v);
    lines.forEach((line, index) => {
      if (matches(line, value)) hits.push({ path, line: index + 1, kind, value });
    });
  }
}

function scanNumberNeedles(path, lines, numbers, hits) {
  lines.forEach((line, index) => {
    for (const match of line.matchAll(DIGIT_RUN)) {
      for (const key of new Set([digitsKey(match[0]), ...match[0].split(/[-/]/).map(digitsKey)])) {
        const kind = numbers.get(key);
        if (kind) hits.push({ path, line: index + 1, kind, value: key });
      }
    }
  });
}

/** Returns [{ path, line, kind, value }]; `value` is real data, mask before printing. */
export function scanText(path, text, needles) {
  const lines = text.split(/\r?\n/).map(normalizeValue);
  const hits = [];
  scanTextNeedles(path, lines, needles.texts, hits);
  scanNumberNeedles(path, lines, needles.numbers, hits);
  return hits;
}

/** First two and last two characters only: `li***ly`. */
export function maskValue(value) {
  const chars = [...value];
  if (chars.length <= 5) return "***";
  return `${chars.slice(0, 2).join("")}***${chars.slice(-2).join("")}`;
}

export function formatHit(hit) {
  const length = [...hit.value].length;
  return `${hit.path}:${hit.line}  ${hit.kind}  ${maskValue(hit.value)} (len ${length})`;
}

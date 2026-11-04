/**
 * Loads the owner's real values for the leak guard from the live SQLCipher DB and vault.
 * Key comes from the same Windows Credential Manager entry the app uses
 * (`@moneytrack/vault`), read without the create-on-miss path; the DB opens read-only.
 * Invariants: fail closed (throw GuardUnavailableError), never log or persist a value or the key.
 */

import fs from "node:fs";
import Database from "better-sqlite3-multiple-ciphers";
import { isEncryptedSqliteAvailable, resolveDbPath } from "@moneytrack/db";
import { loadSecret, MASTER_KEY_TARGET } from "@moneytrack/vault";

export class GuardUnavailableError extends Error {}

// Columns verified against packages/db/src/schema.ts. Bare card/account last-4 is
// skipped on purpose: four digits match half the repo.
const VALUE_QUERIES = [
  ["description", "SELECT DISTINCT description_raw FROM transactions"],
  ["description", "SELECT DISTINCT description_normalized FROM transactions"],
  ["memo", "SELECT DISTINCT json_extract(payload_json, '$.memo') FROM raw_transactions"],
  ["merchant", "SELECT canonical_name FROM merchants"],
  ["merchant-alias", "SELECT raw_descriptor FROM merchant_aliases"],
  ["rule-pattern", "SELECT pattern FROM categorization_rules"],
  ["salary-source", "SELECT display_name FROM salary_sources"],
  ["salary-pattern", "SELECT match_pattern FROM salary_sources"],
  ["person", "SELECT display_name FROM people"],
  ["username", "SELECT username FROM users"],
  ["account-name", "SELECT display_name FROM accounts"],
  ["card-name", "SELECT display_name FROM cards"],
  ["note", "SELECT DISTINCT user_note FROM transactions"],
  ["note", "SELECT note FROM accounts UNION SELECT note FROM cards"],
  [
    "account-number",
    "SELECT provider_account_number FROM raw_accounts UNION SELECT provider_account_number FROM raw_transactions",
  ],
];

async function loadDbKey() {
  if (process.env.MONEYTRACK_MODE === "ha-addon" || process.env.MONEYTRACK_VAULT === "file") {
    throw new GuardUnavailableError(
      "Guard supports the Windows Credential Manager key only; unset MONEYTRACK_MODE / MONEYTRACK_VAULT.",
    );
  }
  let encoded;
  try {
    encoded = await loadSecret(MASTER_KEY_TARGET);
  } catch {
    throw new GuardUnavailableError("Database key not found in Windows Credential Manager.");
  }
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) {
    throw new GuardUnavailableError("Database key in Windows Credential Manager has an invalid length.");
  }
  return key;
}

// ponytail: mirrors the two cipher pragmas of openEncryptedDatabase in
// packages/db/src/connection.ts, which has no read-only mode. Changing that
// package would rebuild its dist under the running agent's `tsx watch`.
function openReadOnly(dbPath, key) {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    db.pragma("cipher='sqlcipher'");
    db.key(key);
    db.prepare("SELECT count(*) FROM sqlite_master").get();
    return db;
  } catch {
    db.close();
    throw new GuardUnavailableError("Database could not be decrypted with the stored key.");
  }
}

function queryValues(db) {
  const entries = [];
  for (const [kind, sql] of VALUE_QUERIES) {
    let values;
    try {
      values = db.prepare(sql).pluck().all();
    } catch (error) {
      throw new GuardUnavailableError(`Query for ${kind} failed: ${error.message}`);
    }
    for (const value of values) {
      if (typeof value === "string" || typeof value === "number") entries.push({ kind, value });
    }
  }
  return entries;
}

/** Non-password login fields (bank user codes, national IDs, card digits, emails). */
async function loadCredentialValues(db) {
  const entries = [];
  const refs = db.prepare("SELECT credential_ref FROM connections").pluck().all();
  for (const ref of refs) {
    let raw;
    try {
      raw = await loadSecret(ref);
    } catch (error) {
      if (/not found/i.test(error.message)) continue;
      throw new GuardUnavailableError("Vault read for a connection credential failed.");
    }
    let fields;
    try {
      fields = JSON.parse(raw);
    } catch {
      throw new GuardUnavailableError("A stored connection credential is not valid JSON.");
    }
    for (const [name, value] of Object.entries(fields ?? {})) {
      if (name !== "password" && value !== null && value !== undefined) {
        entries.push({ kind: "credential", value: String(value) });
      }
    }
  }
  return entries;
}

/** Returns [{ kind, value }] of real values. Throws GuardUnavailableError on any gap. */
export async function loadRealValues() {
  if (!isEncryptedSqliteAvailable()) {
    throw new GuardUnavailableError("Encrypted SQLite (SQLCipher) build does not load in this Node runtime.");
  }
  const dbPath = resolveDbPath();
  if (!fs.existsSync(dbPath)) {
    throw new GuardUnavailableError(`Database not found at ${dbPath} (set MONEYTRACK_DATA_DIR).`);
  }
  const key = await loadDbKey();
  let db;
  try {
    db = openReadOnly(dbPath, key);
  } finally {
    key.fill(0);
  }
  try {
    return [...queryValues(db), ...(await loadCredentialValues(db))];
  } finally {
    db.close();
  }
}

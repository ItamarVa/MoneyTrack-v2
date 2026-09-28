import Database from "better-sqlite3-multiple-ciphers";

let cached: boolean | undefined;

/**
 * Whether the encrypted SQLite build actually loads in this runtime.
 *
 * Tests used to gate on the Node major version, which silently disabled whole
 * suites whenever Node moved ahead of the pinned release. Probing the module
 * instead keeps the suites running wherever the native build does work.
 */
export function isEncryptedSqliteAvailable(): boolean {
  if (cached === undefined) {
    try {
      const probe = new Database(":memory:");
      probe.pragma("cipher='sqlcipher'");
      probe.close();
      cached = true;
    } catch {
      cached = false;
    }
  }
  return cached;
}

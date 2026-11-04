import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import Database from "better-sqlite3-multiple-ciphers";
import { afterEach, describe, expect, it } from "vitest";
import { closeDb, openEncryptedDatabase, runMigrations } from "./connection.js";
import { isEncryptedSqliteAvailable } from "./native-support.js";

const MARKER = "MT_ENCRYPTION_AT_REST_MARKER_7QXZ";
const MERCHANT = "סופר מרקט שלום תל אביב";
const AMOUNT = "12345.67";

describe.skipIf(!isEncryptedSqliteAvailable())(
  "encryption at rest",
  () => {
    const connections: InstanceType<typeof Database>[] = [];
    let tmpDir: string | undefined;

    afterEach(() => {
      for (const connection of connections.splice(0)) {
        try {
          connection.close();
        } catch {
          // already closed
        }
      }
      closeDb();
      if (tmpDir && fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        tmpDir = undefined;
      }
    });

    function track(connection: InstanceType<typeof Database>): InstanceType<typeof Database> {
      connections.push(connection);
      return connection;
    }

    function assertNotInRawFiles(dbPath: string, needle: string): void {
      const buf = Buffer.from(needle, "utf8");
      const files = [dbPath, `${dbPath}-wal`, `${dbPath}-shm`].filter((file) =>
        fs.existsSync(file),
      );
      for (const file of files) {
        expect(fs.readFileSync(file).includes(buf)).toBe(false);
      }
    }

    it("does not store marker, merchant name, or amount in raw database bytes", () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-enc-"));
      const dbPath = path.join(tmpDir, "test.db");
      const key = randomBytes(32);

      const connection = track(openEncryptedDatabase(dbPath, key));
      runMigrations(connection);
      connection
        .prepare(
          "INSERT INTO audit_log (id, user_id, action, metadata, created_at) VALUES (?, NULL, ?, ?, ?)",
        )
        .run(
          randomUUID(),
          MARKER,
          JSON.stringify({ merchant: MERCHANT, amount: AMOUNT }),
          new Date().toISOString(),
        );
      connection.close();
      connections.pop();

      assertNotInRawFiles(dbPath, MARKER);
      assertNotInRawFiles(dbPath, MERCHANT);
      assertNotInRawFiles(dbPath, AMOUNT);
    });

    it("fails to open encrypted file without a key", () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-enc-"));
      const dbPath = path.join(tmpDir, "test.db");
      const key = randomBytes(32);

      const connection = track(openEncryptedDatabase(dbPath, key));
      runMigrations(connection);
      connection.close();
      connections.pop();

      const unkeyed = track(new Database(dbPath, { fileMustExist: true }));
      expect(() => unkeyed.prepare("SELECT 1").get()).toThrow();
    });

    it("fails with wrong encryption key", () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-enc-"));
      const dbPath = path.join(tmpDir, "test.db");
      const key = randomBytes(32);

      const connection = track(openEncryptedDatabase(dbPath, key));
      runMigrations(connection);
      connection.close();
      connections.pop();

      expect(() =>
        openEncryptedDatabase(dbPath, randomBytes(32), { fileMustExist: true }),
      ).toThrow();
    });
  },
);

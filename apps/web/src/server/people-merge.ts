/**
 * Merge one household person into another (duplicates left by the Windows import and HA
 * enrollment). Every column that stores a person id is re-pointed to the target, the source
 * row is deleted, and rollup_monthly (keyed by the person resolved from account owner /
 * cardholder) is rebuilt — all inside ONE DB transaction, so a failure leaves nothing half-moved.
 * Person-id columns (MEM-DATA): users.person_id, accounts.owner_person_id,
 * cards.cardholder_person_id, salary_sources.person_id, rollup_monthly.person_id.
 * A new person-id column in packages/db/src/schema.ts must be added here too.
 */
import {
  accounts,
  cards,
  eq,
  people,
  rollupMonthly,
  salarySources,
  sql,
  users,
  type MoneyTrackDb,
} from "@moneytrack/db";
import { refreshAllRollups } from "@/server/rollup-refresh";

export type PersonMergeCounts = {
  users: number;
  accounts: number;
  cards: number;
  salarySources: number;
};

export type PersonMergeResult =
  | { ok: true; moved: PersonMergeCounts }
  | { ok: false; reason: "same_person" | "source_not_found" | "target_not_found" };

function exists(db: MoneyTrackDb, id: string): boolean {
  return Boolean(db.select({ id: people.id }).from(people).where(eq(people.id, id)).get());
}

const COUNT = { n: sql<number>`count(*)` };

export function mergePerson(db: MoneyTrackDb, sourceId: string, targetId: string): PersonMergeResult {
  if (sourceId === targetId) return { ok: false, reason: "same_person" };
  if (!exists(db, sourceId)) return { ok: false, reason: "source_not_found" };
  if (!exists(db, targetId)) return { ok: false, reason: "target_not_found" };

  const moved: PersonMergeCounts = {
    users: db.select(COUNT).from(users).where(eq(users.personId, sourceId)).get()?.n ?? 0,
    accounts: db.select(COUNT).from(accounts).where(eq(accounts.ownerPersonId, sourceId)).get()?.n ?? 0,
    cards: db.select(COUNT).from(cards).where(eq(cards.cardholderPersonId, sourceId)).get()?.n ?? 0,
    salarySources:
      db.select(COUNT).from(salarySources).where(eq(salarySources.personId, sourceId)).get()?.n ?? 0,
  };
  const now = new Date().toISOString();

  // better-sqlite3 transactions are per connection, so the rollup rebuild below (which takes
  // the outer db handle) still runs inside this transaction and rolls back with it.
  db.transaction((tx) => {
    tx.update(users).set({ personId: targetId, updatedAt: now }).where(eq(users.personId, sourceId)).run();
    tx.update(accounts)
      .set({ ownerPersonId: targetId, updatedAt: now })
      .where(eq(accounts.ownerPersonId, sourceId))
      .run();
    tx.update(cards)
      .set({ cardholderPersonId: targetId, updatedAt: now })
      .where(eq(cards.cardholderPersonId, sourceId))
      .run();
    tx.update(salarySources)
      .set({ personId: targetId, updatedAt: now })
      .where(eq(salarySources.personId, sourceId))
      .run();
    // Stale buckets for periods the rebuild does not visit; the rebuild re-keys the rest.
    tx.delete(rollupMonthly).where(eq(rollupMonthly.personId, sourceId)).run();
    tx.delete(people).where(eq(people.id, sourceId)).run();
    refreshAllRollups(db);
  });

  return { ok: true, moved };
}

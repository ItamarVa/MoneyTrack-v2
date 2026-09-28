import { merchants, transactions, type MoneyTrackDb } from "@moneytrack/db";
import { upsertOpenAlert } from "./alert-store.js";
import { mad, median } from "./stats.js";

const MAD_MULTIPLIER = 3;
const MIN_HISTORY = 5;

function formatIls(amount: number): string {
  return `${amount.toLocaleString("he-IL", { maximumFractionDigits: 0 })} ₪`;
}

export function detectAnomalies(db: MoneyTrackDb): number {
  const expenses = db
    .select()
    .from(transactions)
    .all()
    .filter(
      (row) =>
        row.direction === "debit" &&
        row.kind === "expense" &&
        !row.excludedFromTotals &&
        row.merchantId,
    );

  const byMerchant = new Map<string, typeof expenses>();
  for (const txn of expenses) {
    const key = txn.merchantId!;
    const list = byMerchant.get(key) ?? [];
    list.push(txn);
    byMerchant.set(key, list);
  }

  let created = 0;
  for (const [merchantId, rows] of byMerchant) {
    if (rows.length < MIN_HISTORY) {
      continue;
    }

    const amounts = rows.map((r) => r.amountIls);
    const med = median(amounts);
    const deviation = mad(amounts, med);
    const threshold = med + MAD_MULTIPLIER * (deviation || med * 0.1);

    const latest = [...rows].sort((a, b) => b.transactionDate.localeCompare(a.transactionDate))[0]!;
    if (latest.amountIls <= threshold) {
      continue;
    }

    const merchant = db
      .select()
      .from(merchants)
      .all()
      .find((row) => row.id === merchantId);

    const id = upsertOpenAlert(db, {
      type: "anomaly",
      severity: latest.amountIls > threshold * 1.5 ? "critical" : "warning",
      title: "סכום חריג",
      message: `סכום חריג: ${merchant?.canonicalName ?? "ספק"} — ${formatIls(latest.amountIls)} (רגיל ~${formatIls(med)})`,
      transactionId: latest.id,
      metadata: { merchantId, amount: latest.amountIls, median: med, threshold },
      dedupeKey: `anomaly:${latest.id}`,
    });
    if (id) {
      created += 1;
    }
  }

  return created;
}

export function detectDuplicates(db: MoneyTrackDb): number {
  const expenses = db
    .select()
    .from(transactions)
    .all()
    .filter(
      (row) =>
        row.direction === "debit" &&
        !row.excludedFromTotals &&
        row.merchantId,
    );

  const groups = new Map<string, typeof expenses>();
  for (const txn of expenses) {
    const key = `${txn.merchantId}|${txn.transactionDate}|${txn.amountIls.toFixed(2)}`;
    const list = groups.get(key) ?? [];
    list.push(txn);
    groups.set(key, list);
  }

  let created = 0;
  for (const [, rows] of groups) {
    if (rows.length < 2) {
      continue;
    }

    const sample = rows[0]!;
    const merchant = db
      .select()
      .from(merchants)
      .all()
      .find((row) => row.id === sample.merchantId);

    for (const txn of rows.slice(1)) {
      const id = upsertOpenAlert(db, {
        type: "duplicate",
        severity: "warning",
        title: "חיוב כפול אפשרי",
        message: `חיוב כפול: ${merchant?.canonicalName ?? "ספק"} — ${formatIls(txn.amountIls)} ב-${txn.transactionDate}`,
        transactionId: txn.id,
        metadata: {
          merchantId: sample.merchantId,
          date: sample.transactionDate,
          amount: txn.amountIls,
          duplicateCount: rows.length,
        },
        dedupeKey: `duplicate:${sample.merchantId}:${sample.transactionDate}:${txn.amountIls.toFixed(2)}`,
      });
      if (id) {
        created += 1;
      }
    }
  }

  return created;
}

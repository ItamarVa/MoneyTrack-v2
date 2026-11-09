import { merchants, type MoneyTrackDb } from "@moneytrack/db";
import { upsertOpenAlert } from "./alert-store.js";
import { buildCardPurchaseCheck, looksLikePersonToPerson } from "./detection-rules.js";
import { loadDetectableTransactions, type DetectableTransaction } from "./eligible-transactions.js";
import { median } from "./stats.js";

const MIN_PRIOR_PURCHASES = 4;
const MIN_MULTIPLE = 2;
const MIN_EXCESS_ILS = 100;

function formatIls(amount: number): string {
  return `${amount.toLocaleString("he-IL", { maximumFractionDigits: 0 })} ₪`;
}

/** Unusual = at least 2x the median of >=4 earlier purchases AND at least 100 ₪ above it. */
export function evaluateAnomaly(priorAmounts: number[], amount: number): { median: number } | null {
  if (priorAmounts.length < MIN_PRIOR_PURCHASES) {
    return null;
  }
  const med = median(priorAmounts);
  return amount >= med * MIN_MULTIPLE && amount - med >= MIN_EXCESS_ILS ? { median: med } : null;
}

/** Card purchases per merchant, oldest first. P2P-worded rows never count. */
function cardPurchasesByMerchant(db: MoneyTrackDb): Map<string, DetectableTransaction[]> {
  const isCardPurchase = buildCardPurchaseCheck(db);
  const byMerchant = new Map<string, DetectableTransaction[]>();
  const rows = loadDetectableTransactions(db)
    .filter(
      (row) =>
        row.merchantId &&
        isCardPurchase(row) &&
        !looksLikePersonToPerson(`${row.descriptionRaw} ${row.descriptionNormalized}`),
    )
    .sort((a, b) => a.transactionDate.localeCompare(b.transactionDate) || a.id.localeCompare(b.id));
  for (const row of rows) {
    const list = byMerchant.get(row.merchantId!) ?? [];
    list.push(row);
    byMerchant.set(row.merchantId!, list);
  }
  return byMerchant;
}

/** True when an open anomaly alert on this transaction still qualifies under current rules. */
export function buildAnomalyQualifier(db: MoneyTrackDb): (transactionId: string) => boolean {
  const position = new Map<string, { rows: DetectableTransaction[]; index: number }>();
  for (const rows of cardPurchasesByMerchant(db).values()) {
    rows.forEach((row, index) => position.set(row.id, { rows, index }));
  }
  return (transactionId) => {
    const hit = position.get(transactionId);
    if (!hit) {
      return false;
    }
    const priors = hit.rows.slice(0, hit.index).map((row) => row.amountIls);
    return evaluateAnomaly(priors, hit.rows[hit.index]!.amountIls) !== null;
  };
}

export function detectAnomalies(db: MoneyTrackDb): number {
  const names = new Map(
    db
      .select()
      .from(merchants)
      .all()
      .map((row) => [row.id, row.canonicalName] as const),
  );

  let created = 0;
  for (const [merchantId, rows] of cardPurchasesByMerchant(db)) {
    const latest = rows[rows.length - 1]!;
    const result = evaluateAnomaly(
      rows.slice(0, -1).map((row) => row.amountIls),
      latest.amountIls,
    );
    if (!result) {
      continue;
    }

    const id = upsertOpenAlert(db, {
      type: "anomaly",
      severity: latest.amountIls >= result.median * 4 ? "critical" : "warning",
      title: "סכום חריג",
      message: `${names.get(merchantId) ?? "ספק"}: ${formatIls(latest.amountIls)} במקום כ-${formatIls(result.median)} בדרך כלל`,
      transactionId: latest.id,
      metadata: { merchantId, amount: latest.amountIls, median: result.median },
      dedupeKey: `anomaly:${latest.id}`,
    });
    if (id) {
      created += 1;
    }
  }

  return created;
}

export function detectDuplicates(db: MoneyTrackDb): number {
  const expenses = loadDetectableTransactions(db).filter((row) => row.merchantId);

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

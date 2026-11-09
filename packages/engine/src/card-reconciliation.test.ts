import { describe, expect, it } from "vitest";
import {
  reconcileCards,
  settlementTargets,
  type ReconCardAccount,
  type ReconCardRow,
  type ReconInput,
  type ReconSettlement,
} from "./card-reconciliation.js";

// Synthetic data only.
const cardA: ReconCardAccount = { id: "acc-a", institutionCode: "isracard", last4s: ["1111"] };
const cardB: ReconCardAccount = { id: "acc-b", institutionCode: "max", last4s: ["2222"] };

function row(accountId: string, chargeDate: string, amountIls: number, extra: Partial<ReconCardRow> = {}): ReconCardRow {
  return { accountId, chargeDate, amountIls, direction: "debit", status: "posted", source: "file", ...extra };
}

function bill(date: string, amountIls: number, description: string, extra: Partial<ReconSettlement> = {}): ReconSettlement {
  return { id: `${date}|${description}|${amountIls}`, date, amountIls, description, label: description, direction: "debit", linkedAccountIds: [], ...extra };
}

function run(partial: Partial<ReconInput>) {
  return reconcileCards({
    cards: [cardA],
    cardRows: [],
    settlements: [],
    bankCoverageStart: "2026-01-01",
    from: "2026-01",
    to: "2026-12",
    today: "2026-11-09",
    ...partial,
  });
}

describe("reconcileCards", () => {
  it("matches when the bank debit equals the card rows of that charge month", () => {
    const result = run({
      cardRows: [row("acc-a", "2026-09-02", 100), row("acc-a", "2026-09-02", 50.5)],
      settlements: [bill("2026-09-02", 150.9, "SYNTH CARD 1111")],
    });
    expect(result.get("acc-a")).toEqual([
      {
        month: "2026-09",
        billed: 150.9,
        detailed: 150.5,
        diff: 0.4,
        status: "match",
        combined: false,
        debits: [{ id: expect.any(String), date: "2026-09-02", amount: 150.9, description: "SYNTH CARD 1111" }],
        extras: [],
      },
    ]);
  });

  it("flags a mismatch when a card row is missing", () => {
    const result = run({
      cardRows: [row("acc-a", "2026-09-02", 100)],
      settlements: [bill("2026-09-02", 180, "SYNTH CARD 1111")],
    });
    expect(result.get("acc-a")?.[0]).toMatchObject({ status: "mismatch", diff: 80, detailed: 100 });
  });

  it("nets refunds and counts excluded-kind rows the bill carries; skips pending rows", () => {
    const result = run({
      cardRows: [
        row("acc-a", "2026-09-02", 200),
        row("acc-a", "2026-09-02", 30, { direction: "credit" }),
        row("acc-a", "2026-09-02", 999, { status: "pending" }),
      ],
      settlements: [bill("2026-09-02", 170, "SYNTH CARD 1111")],
    });
    expect(result.get("acc-a")?.[0]).toMatchObject({ status: "match", detailed: 170 });
  });

  it("assigns a debit a few days after the charge day to the card's charge month", () => {
    const result = run({
      cardRows: [row("acc-a", "2026-08-31", 100)],
      settlements: [bill("2026-09-01", 100, "SYNTH CARD 1111")],
    });
    expect(result.get("acc-a")).toEqual([
      {
        month: "2026-08",
        billed: 100,
        detailed: 100,
        diff: 0,
        status: "match",
        combined: false,
        debits: [{ id: expect.any(String), date: "2026-09-01", amount: 100, description: "SYNTH CARD 1111" }],
        extras: [],
      },
    ]);
  });

  it("reports a whole missing month inside detail coverage as a mismatch for the full bill", () => {
    const result = run({
      cardRows: [row("acc-a", "2026-06-02", 10)],
      settlements: [bill("2026-06-02", 10, "SYNTH CARD 1111"), bill("2026-07-02", 400, "SYNTH CARD 1111")],
    });
    expect(result.get("acc-a")?.[1]).toMatchObject({ month: "2026-07", detailed: 0, diff: 400, status: "mismatch" });
  });

  it("sums interim debits of the previous month into the next charge", () => {
    const result = run({
      cardRows: [row("acc-a", "2026-05-01", 900), row("acc-a", "2026-06-01", 1500), row("acc-a", "2026-07-01", 300)],
      settlements: [
        bill("2026-05-01", 900, "SYNTH CARD 1111"),
        bill("2026-05-05", 200, "SYNTH CARD 1111"),
        bill("2026-05-23", 100, "SYNTH CARD 1111"),
        bill("2026-06-01", 1200, "SYNTH CARD 1111"),
        bill("2026-07-01", 300, "SYNTH CARD 1111"),
      ],
    });
    expect(result.get("acc-a")?.map((m) => [m.month, m.status, m.billed, m.debits.length])).toEqual([
      ["2026-05", "match", 900, 1],
      ["2026-06", "match", 1500, 3],
      ["2026-07", "match", 300, 1],
    ]);
  });

  it("counts a debit on the charge date itself toward that charge", () => {
    const result = run({
      cardRows: [row("acc-a", "2026-08-02", 50), row("acc-a", "2026-09-02", 70)],
      settlements: [bill("2026-08-02", 50, "SYNTH CARD 1111"), bill("2026-09-02", 70, "SYNTH CARD 1111")],
    });
    expect(result.get("acc-a")?.map((m) => [m.month, m.status])).toEqual([
      ["2026-08", "match"],
      ["2026-09", "match"],
    ]);
  });

  it("puts a debit after the last known charge date into the coming, open month", () => {
    const result = run({
      cardRows: [row("acc-a", "2026-11-02", 80)],
      settlements: [bill("2026-11-02", 80, "SYNTH CARD 1111"), bill("2026-11-06", 500, "SYNTH CARD 1111")],
    });
    expect(result.get("acc-a")?.map((m) => [m.month, m.status, m.billed])).toEqual([
      ["2026-11", "match", 80],
      ["2026-12", "open", 500],
    ]);
  });

  it("says no_details for months before the card has detail coverage", () => {
    const result = run({
      cardRows: [row("acc-a", "2026-05-02", 40)],
      settlements: [bill("2026-03-02", 700, "SYNTH CARD 1111"), bill("2026-05-02", 40, "SYNTH CARD 1111")],
    });
    expect(result.get("acc-a")?.map((m) => [m.month, m.status])).toEqual([
      ["2026-03", "no_details"],
      ["2026-05", "match"],
    ]);
    // A card without any rows is never covered.
    const bare = run({ settlements: [bill("2026-07-02", 400, "SYNTH CARD 1111")] });
    expect(bare.get("acc-a")?.[0]).toMatchObject({ month: "2026-07", diff: 400, status: "no_details" });
  });

  it("leaves a same-day extra debit out of a bill the other debits match", () => {
    const result = run({
      cardRows: [row("acc-a", "2026-01-01", 10), row("acc-a", "2026-02-01", 1200)],
      settlements: [
        bill("2026-01-01", 10, "SYNTH CARD 1111"),
        bill("2026-02-01", 1200, "SYNTH CARD 1111"),
        bill("2026-02-01", 105, "SYNTH CARD 1111 EXTRA"),
        bill("2026-02-03", 140.45, "SYNTH LOAD 1111"),
      ],
    });
    expect(result.get("acc-a")?.[1]).toEqual({
      month: "2026-02",
      billed: 1200,
      detailed: 1200,
      diff: 0,
      status: "match",
      combined: false,
      debits: [{ id: expect.any(String), date: "2026-02-01", amount: 1200, description: "SYNTH CARD 1111" }],
      extras: [
        { id: expect.any(String), date: "2026-02-01", amount: 105, description: "SYNTH CARD 1111 EXTRA" },
        { id: expect.any(String), date: "2026-02-03", amount: 140.45, description: "SYNTH LOAD 1111" },
      ],
    });
  });

  it("matches prepayments made during the previous month as part of the bill", () => {
    const result = run({
      cardRows: [row("acc-a", "2026-05-01", 50), row("acc-a", "2026-06-01", 6400)],
      settlements: [
        bill("2026-05-01", 50, "SYNTH CARD 1111"),
        bill("2026-05-05", 2000, "SYNTH PREPAY 1111"),
        bill("2026-05-23", 400, "SYNTH PREPAY 1111"),
        bill("2026-06-01", 4000, "SYNTH CARD 1111"),
        bill("2026-06-01", 1057, "SYNTH CARD 1111 EXTRA"),
      ],
    });
    const june = result.get("acc-a")?.[1];
    expect(june).toMatchObject({ month: "2026-06", status: "match", billed: 6400, diff: 0 });
    expect(june?.debits.map((d) => d.amount)).toEqual([2000, 400, 4000]);
    expect(june?.extras.map((d) => d.amount)).toEqual([1057]);
  });

  it("keeps another card's mid-month issuer debits as extras of a matching bill", () => {
    const result = run({
      cards: [cardB],
      cardRows: [row("acc-b", "2026-02-02", 700), row("acc-b", "2026-03-02", 900)],
      settlements: [
        bill("2026-02-02", 700, "SYNTH MAX IT"),
        bill("2026-02-09", 20208, "SYNTH MAX IT OLD"),
        bill("2026-03-02", 900, "SYNTH MAX IT"),
        bill("2026-03-09", 6684, "SYNTH MAX IT OLD"),
      ],
    });
    expect(result.get("acc-b")?.map((m) => [m.month, m.status, m.billed, m.extras.map((d) => d.amount)])).toEqual([
      ["2026-02", "match", 700, []],
      ["2026-03", "match", 900, [20208]],
      ["2026-04", "no_bill", null, [6684]],
    ]);
  });

  it("bills only the charge-day debits when no subset matches", () => {
    const result = run({
      cardRows: [row("acc-a", "2026-06-01", 5), row("acc-a", "2026-07-01", 1000)],
      settlements: [
        bill("2026-06-01", 5, "SYNTH CARD 1111"),
        bill("2026-06-10", 300, "SYNTH CARD 1111"),
        bill("2026-07-01", 600, "SYNTH CARD 1111"),
      ],
    });
    expect(result.get("acc-a")?.[1]).toMatchObject({
      month: "2026-07",
      status: "mismatch",
      billed: 600,
      diff: -400,
      debits: [{ id: expect.any(String), date: "2026-07-01", amount: 600, description: "SYNTH CARD 1111" }],
      extras: [{ id: expect.any(String), date: "2026-06-10", amount: 300, description: "SYNTH CARD 1111" }],
    });
  });

  it("prefers the charge-day debit when another subset would also match", () => {
    const result = run({
      cardRows: [row("acc-a", "2026-06-01", 5), row("acc-a", "2026-07-01", 500)],
      settlements: [
        bill("2026-06-01", 5, "SYNTH CARD 1111"),
        bill("2026-06-15", 500, "SYNTH INTERIM 1111"),
        bill("2026-07-01", 500, "SYNTH CARD 1111"),
      ],
    });
    expect(result.get("acc-a")?.[1]).toMatchObject({
      status: "match",
      debits: [{ id: expect.any(String), date: "2026-07-01", amount: 500, description: "SYNTH CARD 1111" }],
      extras: [{ id: expect.any(String), date: "2026-06-15", amount: 500, description: "SYNTH INTERIM 1111" }],
    });
  });

  it("tries only the charge-day debits plus the 15 largest others", () => {
    const interim = Array.from({ length: 20 }, (_, i) =>
      bill(`2026-06-${String(i + 5).padStart(2, "0")}`, i + 1, "SYNTH INTERIM 1111"),
    );
    const settlements = [bill("2026-06-01", 5, "SYNTH CARD 1111"), ...interim, bill("2026-07-01", 1000, "SYNTH CARD 1111")];
    const cardRows = [row("acc-a", "2026-06-01", 5)];
    // 1 + 2 sit outside the 16 tried debits, so 1003 cannot be reached.
    const capped = run({ cardRows: [...cardRows, row("acc-a", "2026-07-01", 1003)], settlements });
    expect(capped.get("acc-a")?.[1]).toMatchObject({ status: "mismatch", billed: 1000 });
    expect(capped.get("acc-a")?.[1]?.extras).toHaveLength(20);
    const reachable = run({ cardRows: [...cardRows, row("acc-a", "2026-07-01", 1026)], settlements });
    expect(reachable.get("acc-a")?.[1]).toMatchObject({ status: "match", billed: 1026 });
  });

  it("treats a scraped card first charge month as partial (no_details), later months as covered", () => {
    const sync = { source: "sync" };
    const result = run({
      cards: [cardB],
      cardRows: [row("acc-b", "2026-03-10", 70, sync), row("acc-b", "2026-04-10", 90, sync)],
      settlements: [bill("2026-03-10", 4300, "SYNTH CARD 2222"), bill("2026-04-10", 95, "SYNTH CARD 2222")],
    });
    expect(result.get("acc-b")?.map((m) => [m.month, m.status, m.diff])).toEqual([
      ["2026-03", "no_details", 4230],
      ["2026-04", "mismatch", 5],
    ]);
  });

  it("says no_bill for a past charge without a bank debit, and open for a coming one", () => {
    const result = run({
      cardRows: [row("acc-a", "2026-10-02", 100), row("acc-a", "2026-11-10", 70), row("acc-a", "2025-12-02", 5)],
    });
    expect(result.get("acc-a")?.map((m) => [m.month, m.status])).toEqual([
      ["2026-10", "no_bill"],
      ["2026-11", "open"],
    ]);
  });

  it("keeps two cards apart by the last four digits in the bank description", () => {
    const result = run({
      cards: [cardA, cardB],
      cardRows: [row("acc-a", "2026-09-02", 100), row("acc-b", "2026-09-10", 300)],
      settlements: [bill("2026-09-02", 100, "SYNTH CARD 1111"), bill("2026-09-10", 250, "SYNTH CARD 2222")],
    });
    expect(result.get("acc-a")?.[0]?.status).toBe("match");
    expect(result.get("acc-b")?.[0]).toMatchObject({ status: "mismatch", diff: -50 });
  });

  it("compares a combined bank row against the group of cards it paid", () => {
    const twin: ReconCardAccount = { id: "acc-c", institutionCode: "isracard", last4s: [] };
    const result = run({
      cards: [cardA, twin],
      cardRows: [row("acc-a", "2026-09-02", 100), row("acc-c", "2026-09-02", 60)],
      settlements: [bill("2026-09-02", 160, "ISRACARD SYNTH")],
    });
    expect(result.get("acc-a")?.[0]).toMatchObject({ billed: 160, detailed: 160, status: "match", combined: true });
    expect(result.get("acc-c")?.[0]).toMatchObject({ combined: true, status: "match" });
  });
});

describe("settlementTargets", () => {
  it("prefers existing engine links, then last four, then a sole issuer card", () => {
    expect(settlementTargets({ description: "x 2222", linkedAccountIds: ["acc-a"] }, [cardA, cardB])).toEqual(["acc-a"]);
    expect(settlementTargets({ description: "x 2222", linkedAccountIds: [] }, [cardA, cardB])).toEqual(["acc-b"]);
    expect(settlementTargets({ description: "ISRACARD SYNTH", linkedAccountIds: [] }, [cardA, cardB])).toEqual(["acc-a"]);
  });

  it("ignores a debit for a card we do not hold", () => {
    expect(settlementTargets({ description: "ISRACARD 9999", linkedAccountIds: [] }, [cardA])).toEqual([]);
    expect(settlementTargets({ description: "SYNTH SHOP", linkedAccountIds: [] }, [cardA])).toEqual([]);
  });
});

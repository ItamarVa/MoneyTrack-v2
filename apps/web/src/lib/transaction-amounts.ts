/**

 * Signed amount display for UI — mirrors packages/engine/src/amounts.ts.

 * Client-safe copy so components never import @moneytrack/engine (Node-only).

 */

import { formatForeignAmountExact, formatIlsExact } from "@/lib/currency";



type TxnSlice = {

  excludedFromTotals: boolean;

  kind: string;

  direction: string;

  amountIls: number;

  originalAmount: number;

  originalCurrency: string;

};



export function expenseContribution(txn: TxnSlice): number {

  if (txn.excludedFromTotals) {

    return 0;

  }

  if (txn.kind === "expense" || txn.kind === "loan_payment") {

    return txn.direction === "debit" ? txn.amountIls : -txn.amountIls;

  }

  if (txn.kind === "refund") {

    return txn.direction === "credit" ? -txn.amountIls : txn.amountIls;

  }

  return 0;

}



export function incomeContribution(txn: TxnSlice): number {

  if (txn.excludedFromTotals) {

    return 0;

  }

  if (txn.kind === "income") {

    return txn.direction === "credit" ? txn.amountIls : -txn.amountIls;

  }

  return 0;

}



export type AmountDisplayTone = "expense" | "income" | "neutral";



export type AmountDisplay = {

  text: string;

  tone: AmountDisplayTone;

  secondary?: string;

};



function foreignSecondary(txn: TxnSlice): string | undefined {

  if (txn.originalCurrency === "ILS" || txn.originalAmount === 0) {

    return undefined;

  }

  return formatForeignAmountExact(txn.originalAmount, txn.originalCurrency);

}



/** Signed display text, tone, and optional original-currency line for a transaction row. */

export function formatTransactionAmountDisplay(txn: TxnSlice): AmountDisplay {

  if (txn.amountIls === 0) {

    return {

      text: "טרם חויב",

      tone: "neutral",

      secondary: foreignSecondary(txn),

    };

  }



  const expense = expenseContribution(txn);

  if (expense > 0) {

    return { text: formatIlsExact(-expense), tone: "expense", secondary: foreignSecondary(txn) };

  }



  const income = incomeContribution(txn);

  if (income > 0) {

    return { text: formatIlsExact(income), tone: "income", secondary: foreignSecondary(txn) };

  }



  return { text: formatIlsExact(0), tone: "neutral", secondary: foreignSecondary(txn) };

}



export function amountToneClass(tone: AmountDisplayTone): string {

  if (tone === "expense") {

    return "text-money-expense";

  }

  if (tone === "income") {

    return "text-money-income";

  }

  return "text-text-primary";

}



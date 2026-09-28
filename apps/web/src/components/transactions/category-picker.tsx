"use client";



import type { Category, Transaction } from "@moneytrack/contracts";

import { useState } from "react";

import { setTransactionCategory } from "@/lib/api-client";



type CategoryPickerProps = {

  transactionId: string;

  value: string | null;

  classificationSource: string | null;

  categories: Category[];

  /** Receives the updated row so the list can patch it without reloading. */

  onChanged: (updated: Transaction) => void;

};



export function CategoryPicker({

  transactionId,

  value,

  classificationSource,

  categories,

  onChanged,

}: CategoryPickerProps) {

  const [pending, setPending] = useState(false);



  const badge =

    classificationSource === "manual"

      ? "ידני"

      : classificationSource

        ? "אוטומטי"

        : null;



  return (

    <div className="flex min-w-0 items-center gap-2">

      <select

        disabled={pending}

        value={value ?? ""}

        onChange={async (event) => {

          const categoryId = event.target.value;

          if (!categoryId) return;

          setPending(true);

          try {

            onChanged(await setTransactionCategory(transactionId, categoryId));

          } finally {

            setPending(false);

          }

        }}

        className="max-w-full rounded-md border border-border-strong bg-surface-card px-2 py-1 text-xs text-text-primary"

      >

        <option value="">בחר קטגוריה</option>

        {categories.map((category) => (

          <option key={category.id} value={category.id}>

            {category.name}

          </option>

        ))}

      </select>

      {badge ? (

        <span className="shrink-0 rounded-full border border-border-subtle bg-surface-elevated px-2 py-0.5 text-[10px] text-text-secondary">

          {badge}

        </span>

      ) : null}

    </div>

  );

}


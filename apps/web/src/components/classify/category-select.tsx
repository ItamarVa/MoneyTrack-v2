"use client";

/**
 * Shared category dropdown for classify flows — loads categories once per mount.
 * Excludes the seeded "לא מסווג" row unless allowUncategorized is set (provider map).
 */
import type { Category } from "@moneytrack/contracts";
import { useEffect, useState } from "react";
import { fetchCategories } from "@/lib/api-client";
import { UNCATEGORIZED_CATEGORY_ID } from "@/lib/category-ids";

type CategorySelectProps = {
  value: string | null;
  onChange: (categoryId: string) => void;
  disabled?: boolean;
  /** When true, includes an explicit "לא מסווג" option with the seeded category id. */
  allowUncategorized?: boolean;
  placeholder?: string;
  className?: string;
};

export function CategorySelect({
  value,
  onChange,
  disabled = false,
  allowUncategorized = false,
  placeholder = "בחר קטגוריה",
  className,
}: CategorySelectProps) {
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    void fetchCategories().then(setCategories);
  }, []);

  const options = allowUncategorized
    ? categories
    : categories.filter((row) => row.id !== UNCATEGORIZED_CATEGORY_ID);

  return (
    <select
      disabled={disabled}
      value={value ?? ""}
      onChange={(event) => {
        const next = event.target.value;
        if (!next) return;
        onChange(next);
      }}
      className={
        className ??
        "max-w-full rounded-md border border-border-strong bg-surface-card px-2 py-1 text-xs text-text-primary"
      }
    >
      <option value="">{placeholder}</option>
      {allowUncategorized ? (
        <option value={UNCATEGORIZED_CATEGORY_ID}>לא מסווג</option>
      ) : null}
      {options
        .filter((row) => row.id !== UNCATEGORIZED_CATEGORY_ID)
        .map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
    </select>
  );
}

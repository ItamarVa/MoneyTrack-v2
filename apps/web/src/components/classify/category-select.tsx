"use client";

/**
 * Shared category picker for classify flows — loads categories once per mount and opens the
 * searchable grouped chooser. Excludes the seeded uncategorized row unless allowUncategorized
 * is set (provider map, where "no category" is a legitimate mapping, not a manual lock).
 */
import type { Category } from "@moneytrack/contracts";
import { useEffect, useState } from "react";
import { CategoryChooserField } from "@/components/category/category-chooser";
import { fetchCategories } from "@/lib/api-client";
import { UNCATEGORIZED_CATEGORY_ID } from "@/lib/category-ids";

const NO_EXCLUSIONS: readonly string[] = [];
const EXCLUDE_UNCATEGORIZED: readonly string[] = [UNCATEGORIZED_CATEGORY_ID];

type CategorySelectProps = {
  value: string | null;
  onChange: (categoryId: string) => void;
  disabled?: boolean;
  /** When true, offers the seeded uncategorized category as a choice. */
  allowUncategorized?: boolean;
  placeholder?: string;
  /** Classes for the trigger button; callers pass the old <select> styling unchanged. */
  className?: string;
};

export function CategorySelect({
  value,
  onChange,
  disabled = false,
  allowUncategorized = false,
  placeholder,
  className,
}: CategorySelectProps) {
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    void fetchCategories().then(setCategories);
  }, []);

  return (
    <CategoryChooserField
      categories={categories}
      value={value}
      onChange={onChange}
      disabled={disabled}
      excludeIds={allowUncategorized ? NO_EXCLUSIONS : EXCLUDE_UNCATEGORIZED}
      placeholder={placeholder}
      className={
        className
          ? `${className} flex items-center justify-between gap-2 text-start`
          : undefined
      }
    />
  );
}

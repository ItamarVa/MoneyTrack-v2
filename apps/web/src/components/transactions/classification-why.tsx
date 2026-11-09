"use client";

/**
 * "למה?" popover for classification chain — rendered in a portal so table overflow cannot clip it.
 */
import type { Category, ClassificationDetailResponse } from "@moneytrack/contracts";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  formatClassificationChainStep,
  formatClassificationWhySummary,
} from "@/lib/classification-why-labels";
import { fetchClassificationDetail, fetchCategories } from "@/lib/api-client";

type ClassificationWhyProps = {
  transactionId: string;
  categories?: Category[];
};

export function ClassificationWhy({ transactionId, categories: categoriesProp }: ClassificationWhyProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [showTechnical, setShowTechnical] = useState(false);
  const [detail, setDetail] = useState<ClassificationDetailResponse | null>(null);
  const [categoriesById, setCategoriesById] = useState<Map<string, Category>>(() =>
    categoriesProp ? new Map(categoriesProp.map((row) => [row.id, row])) : new Map(),
  );
  const [loading, setLoading] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const updatePosition = (): void => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const panelWidth = 288;
      const left = Math.min(Math.max(8, rect.right - panelWidth), window.innerWidth - panelWidth - 8);
      setPosition({ top: rect.bottom + 4, left });
    };
    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };
    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (categoriesProp) {
      setCategoriesById(new Map(categoriesProp.map((row) => [row.id, row])));
    }
  }, [categoriesProp]);

  async function load(): Promise<void> {
    setLoading(true);
    try {
      const detailRow = await fetchClassificationDetail(transactionId);
      setDetail(detailRow);
      if (!categoriesProp && categoriesById.size === 0) {
        const categoryRows = await fetchCategories();
        setCategoriesById(new Map(categoryRows.map((row) => [row.id, row])));
      }
      setShowTechnical(false);
      setOpen(true);
    } finally {
      setLoading(false);
    }
  }

  const categoryName =
    detail?.categoryId != null ? categoriesById.get(detail.categoryId)?.name ?? null : null;

  const panel =
    open && detail && position ? (
      <div
        ref={panelRef}
        style={{ top: position.top, left: position.left }}
        className="fixed z-[100] w-72 rounded-lg border border-border-subtle bg-surface-card p-3 text-xs shadow-lg"
      >
        <p className="mb-2 font-semibold text-text-primary">למה הקטגוריה הזו?</p>
        <p className="text-sm leading-relaxed text-text-secondary">
          {formatClassificationWhySummary(detail, categoryName)}
        </p>
        <button
          type="button"
          onClick={() => setShowTechnical((current) => !current)}
          className="mt-3 text-[11px] font-medium text-brand-blue-500 hover:underline"
        >
          {showTechnical ? "הסתר פירוט טכני" : "הצג פירוט טכני"}
        </button>
        {showTechnical ? (
          <ol className="mt-2 space-y-1 border-t border-border-subtle pt-2 text-text-secondary">
            {detail.chain.map((step) => {
              const stepCategoryName =
                step.categoryId != null ? categoriesById.get(step.categoryId)?.name ?? null : null;
              return (
                <li key={step.stage}>
                  {formatClassificationChainStep(step, stepCategoryName)}
                </li>
              );
            })}
          </ol>
        ) : null}
      </div>
    ) : null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        disabled={loading}
        onClick={() => (open ? setOpen(false) : void load())}
        className="rounded-md px-2 py-1 text-[10px] text-text-muted transition hover:bg-surface-elevated hover:text-text-primary"
      >
        למה?
      </button>
      {typeof document !== "undefined" && panel ? createPortal(panel, document.body) : null}
    </>
  );
}

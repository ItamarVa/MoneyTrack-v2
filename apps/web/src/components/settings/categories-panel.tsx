"use client";

/**
 * Settings tab for managing the category tree: create, rename, reparent, reorder, delete.
 * Row actions use a shrink-0 toolbar so long Hebrew names cannot cover click targets in RTL.
 */
import type { Category } from "@moneytrack/contracts";
import { ChevronDown, ChevronUp, Pencil, Trash2 } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/toast";
import {
  createCategory,
  deleteCategory,
  fetchCategories,
  updateCategory,
} from "@/lib/api-client";

const UNCATEGORIZED_CATEGORY_ID = "00000000-0000-4000-8000-000000000001";

const inputClass =
  "min-h-10 w-full rounded-lg border border-border-subtle bg-surface-bg px-3 text-sm";

function buildTree(categories: Category[]): Category[] {
  const roots = categories
    .filter((c) => !c.parentId)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "he"));

  const childrenOf = (parentId: string) =>
    categories
      .filter((c) => c.parentId === parentId)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "he"));

  const flat: Category[] = [];
  for (const root of roots) {
    flat.push(root);
    for (const child of childrenOf(root.id)) {
      flat.push(child);
    }
  }
  return flat;
}

type DeleteDialogProps = {
  open: boolean;
  categoryName: string;
  reassignTo: string;
  options: Category[];
  saving: boolean;
  onReassignChange: (id: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
};

function DeleteCategoryDialog({
  open,
  categoryName,
  reassignTo,
  options,
  saving,
  onReassignChange,
  onConfirm,
  onCancel,
}: DeleteDialogProps) {
  const titleId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-brand-navy-900/50 p-4 backdrop-blur-sm">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md rounded-card border border-border-subtle bg-surface-card p-6 shadow-soft"
      >
        <h2 id={titleId} className="font-display text-lg text-text-primary">מחיקת קטגוריה</h2>
        <p className="mt-3 text-sm text-text-secondary">
          למחוק &quot;{categoryName}&quot;? עסקאות וכללים יועברו לקטגוריה שתבחרו.
        </p>
        <select
          value={reassignTo}
          onChange={(e) => onReassignChange(e.target.value)}
          className="mt-4 min-h-11 w-full rounded-lg border border-border-subtle bg-surface-bg px-3 text-sm"
        >
          {options.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="min-h-11 rounded-lg border border-border-subtle px-4 text-sm font-medium hover:bg-surface-elevated"
          >
            ביטול
          </button>
          <button
            type="button"
            disabled={saving || !reassignTo}
            onClick={onConfirm}
            className="min-h-11 rounded-lg bg-brand-orange-500 px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            {saving ? "מוחק…" : "מחיקה"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function CategoriesPanel() {
  const { showToast } = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newParentId, setNewParentId] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [reassignTo, setReassignTo] = useState(UNCATEGORIZED_CATEGORY_ID);

  /** Silent after the first fetch — see the note in settings/rules-panel.tsx. */
  const load = useCallback(async () => {
    try {
      setCategories(await fetchCategories());
    } catch (err) {
      showToast(err instanceof Error ? err.message : "טעינת קטגוריות נכשלה", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const tree = useMemo(() => buildTree(categories), [categories]);
  const parentOptions = useMemo(
    () => categories.filter((c) => !c.parentId && c.id !== UNCATEGORIZED_CATEGORY_ID),
    [categories],
  );
  const reassignOptions = useMemo(
    () => categories.filter((c) => c.id !== deleteTarget?.id),
    [categories, deleteTarget],
  );

  function startEdit(category: Category) {
    setEditingId(category.id);
    setEditName(category.name);
  }

  function startDelete(category: Category) {
    setDeleteTarget(category);
    setReassignTo(UNCATEGORIZED_CATEGORY_ID);
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setSaving(true);
    try {
      const siblings = categories.filter((c) => (c.parentId ?? null) === (newParentId || null));
      const maxOrder = siblings.reduce((max, c) => Math.max(max, c.sortOrder), 0);
      await createCategory({
        name,
        parentId: newParentId || null,
        sortOrder: maxOrder + 1,
      });
      setNewName("");
      await load();
      showToast("קטגוריה נוספה", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "יצירה נכשלה", "error");
    } finally {
      setSaving(false);
    }
  }

  async function saveRename(id: string) {
    const name = editName.trim();
    if (!name) {
      showToast("שם הקטגוריה לא יכול להיות ריק", "error");
      return;
    }
    setPendingId(id);
    try {
      await updateCategory(id, { name });
      setEditingId(null);
      await load();
      showToast("השם עודכן", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "עדכון שם נכשל", "error");
    } finally {
      setPendingId(null);
    }
  }

  async function moveSort(id: string, direction: -1 | 1) {
    const row = categories.find((c) => c.id === id);
    if (!row) return;
    const siblings = categories
      .filter((c) => c.parentId === row.parentId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const index = siblings.findIndex((c) => c.id === id);
    const swap = siblings[index + direction];
    if (!swap) return;
    setPendingId(id);
    try {
      await updateCategory(id, { sortOrder: swap.sortOrder });
      await updateCategory(swap.id, { sortOrder: row.sortOrder });
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "שינוי סדר נכשל", "error");
    } finally {
      setPendingId(null);
    }
  }

  async function changeParent(id: string, parentId: string) {
    setPendingId(id);
    try {
      await updateCategory(id, { parentId: parentId || null });
      await load();
      showToast("ההיררכיה עודכנה", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "שינוי היררכיה נכשל", "error");
    } finally {
      setPendingId(null);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget || !reassignTo) return;
    setSaving(true);
    try {
      await deleteCategory(deleteTarget.id, reassignTo);
      setDeleteTarget(null);
      await load();
      showToast("הקטגוריה נמחקה", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "מחיקה נכשלה", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-card border border-border-subtle bg-surface-card p-5">
      <h2 className="font-display text-lg text-text-primary">ניהול קטגוריות</h2>
      <p className="mt-1 text-sm text-text-muted">יצירה, שינוי שם, שינוי היררכיה ומחיקה עם העברה</p>

      {loading ? (
        <p className="mt-4 text-sm text-text-muted">טוען קטגוריות…</p>
      ) : (
        <>
          <ul className="mt-4 space-y-2">
            {tree.map((category) => {
              const isChild = Boolean(category.parentId);
              const isProtected = category.id === UNCATEGORIZED_CATEGORY_ID;
              const rowBusy = pendingId === category.id;

              return (
                <li
                  key={category.id}
                  className={[
                    "rounded-lg bg-surface-elevated px-3 py-2",
                    isChild ? "ms-6" : "",
                  ].join(" ")}
                >
                  {editingId === category.id ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className={inputClass}
                        autoFocus
                      />
                      <button
                        type="button"
                        disabled={rowBusy}
                        onClick={() => void saveRename(category.id)}
                        className="min-h-10 rounded-lg bg-brand-blue-500 px-4 text-sm text-white disabled:opacity-60"
                      >
                        שמירה
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="min-h-10 rounded-lg border border-border-subtle px-4 text-sm"
                      >
                        ביטול
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-text-primary">
                          {category.name}
                        </span>
                      </div>

                      {!isProtected ? (
                        <div className="flex shrink-0 flex-wrap items-center gap-1">
                          <button
                            type="button"
                            disabled={rowBusy}
                            onClick={() => startEdit(category)}
                            className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg px-2 text-sm text-text-secondary hover:bg-surface-card disabled:opacity-60"
                            aria-label={`עריכת ${category.name}`}
                          >
                            <Icon icon={Pencil} size={14} />
                          </button>
                          <select
                            value={category.parentId ?? ""}
                            disabled={rowBusy}
                            onChange={(e) => void changeParent(category.id, e.target.value)}
                            className="min-h-9 max-w-[9rem] rounded-lg border border-border-subtle bg-surface-bg px-2 text-xs"
                            title="העבר תחת קטגוריה אב"
                            aria-label={`היררכיה של ${category.name}`}
                          >
                            <option value="">קטגוריה ראשית</option>
                            {parentOptions
                              .filter((parent) => parent.id !== category.id)
                              .map((parent) => (
                                <option key={parent.id} value={parent.id}>
                                  {parent.name}
                                </option>
                              ))}
                          </select>
                          <button
                            type="button"
                            disabled={rowBusy}
                            onClick={() => void moveSort(category.id, -1)}
                            className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg text-text-muted hover:bg-surface-card disabled:opacity-60"
                            aria-label={`הזז ${category.name} למעלה`}
                          >
                            <Icon icon={ChevronUp} size={16} />
                          </button>
                          <button
                            type="button"
                            disabled={rowBusy}
                            onClick={() => void moveSort(category.id, 1)}
                            className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg text-text-muted hover:bg-surface-card disabled:opacity-60"
                            aria-label={`הזז ${category.name} למטה`}
                          >
                            <Icon icon={ChevronDown} size={16} />
                          </button>
                          <button
                            type="button"
                            disabled={rowBusy}
                            onClick={() => startDelete(category)}
                            className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg text-brand-orange-500 hover:bg-brand-orange-500/10 disabled:opacity-60"
                            aria-label={`מחיקת ${category.name}`}
                          >
                            <Icon icon={Trash2} size={14} />
                          </button>
                        </div>
                      ) : null}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          <form onSubmit={(e) => void handleCreate(e)} className="mt-6 space-y-3 border-t border-border-subtle pt-4">
            <h3 className="text-sm font-medium text-text-primary">הוספת קטגוריה</h3>
            <div className="flex flex-wrap gap-3">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="שם קטגוריה חדשה"
                className="min-h-11 min-w-48 flex-1 rounded-lg border border-border-subtle bg-surface-bg px-3 text-sm"
              />
              <select
                value={newParentId}
                onChange={(e) => setNewParentId(e.target.value)}
                className="min-h-11 rounded-lg border border-border-subtle bg-surface-bg px-3 text-sm"
              >
                <option value="">קטגוריה ראשית</option>
                {parentOptions.map((parent) => (
                  <option key={parent.id} value={parent.id}>
                    תחת {parent.name}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                disabled={saving || !newName.trim()}
                className="min-h-11 rounded-lg bg-brand-orange-500 px-4 text-sm font-medium text-white disabled:opacity-60"
              >
                {saving ? "שומר…" : "הוספה"}
              </button>
            </div>
          </form>
        </>
      )}

      <DeleteCategoryDialog
        open={deleteTarget !== null}
        categoryName={deleteTarget?.name ?? ""}
        reassignTo={reassignTo}
        options={reassignOptions}
        saving={saving}
        onReassignChange={setReassignTo}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </section>
  );
}

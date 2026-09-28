"use client";



/**

 * Settings tab for categorization rules: CRUD and live match preview.

 */

import type { CategorizationRule, Category } from "@moneytrack/contracts";

import { useCallback, useEffect, useMemo, useState } from "react";

import {

  createRule,

  deleteRule,

  fetchCategories,

  fetchRules,

  previewRuleMatches,

  updateRule,

} from "@/lib/api-client";



export function RulesPanel() {

  const [rules, setRules] = useState<CategorizationRule[]>([]);

  const [categories, setCategories] = useState<Category[]>([]);

  const [loading, setLoading] = useState(true);

  const [saving, setSaving] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const [pattern, setPattern] = useState("");

  const [categoryId, setCategoryId] = useState("");

  const [priority, setPriority] = useState("10");

  const [matchCount, setMatchCount] = useState<number | null>(null);

  const [previewPending, setPreviewPending] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);



  const categoryNameById = useMemo(() => {

    const map = new Map<string, string>();

    for (const category of categories) {

      map.set(category.id, category.name);

    }

    return map;

  }, [categories]);



  /**

   * Reloads silently after the first fetch: flipping `loading` back on would

   * unmount the list and the form, which collapses the page and throws the

   * browser scroll position to the top after every save.

   */

  const load = useCallback(async () => {

    setError(null);

    try {

      const [ruleRows, categoryRows] = await Promise.all([fetchRules(), fetchCategories()]);

      setRules(ruleRows);

      setCategories(categoryRows);

      setCategoryId((current) => current || categoryRows[0]?.id || "");

    } catch (err) {

      setError(err instanceof Error ? err.message : "Load failed");

    } finally {

      setLoading(false);

    }

  }, []);



  useEffect(() => {

    void load();

  }, [load]);



  useEffect(() => {

    const trimmed = pattern.trim();

    if (!trimmed) {

      setMatchCount(null);

      return;

    }

    setPreviewPending(true);

    const handle = window.setTimeout(() => {

      void previewRuleMatches(trimmed)

        .then(setMatchCount)

        .catch(() => setMatchCount(null))

        .finally(() => setPreviewPending(false));

    }, 300);

    return () => window.clearTimeout(handle);

  }, [pattern]);



  async function handleCreate(event: React.FormEvent) {

    event.preventDefault();

    const trimmed = pattern.trim();

    const parsedPriority = Number.parseInt(priority, 10);

    if (!trimmed || !categoryId || !Number.isFinite(parsedPriority)) return;



    setSaving(true);

    setError(null);

    try {

      if (editingId) {

        await updateRule(editingId, {

          pattern: trimmed,

          categoryId,

          priority: parsedPriority,

        });

        setEditingId(null);

      } else {

        await createRule({

          pattern: trimmed,

          categoryId,

          priority: parsedPriority,

          enabled: true,

        });

      }

      setPattern("");

      setPriority("10");

      setMatchCount(null);

      await load();

    } catch (err) {

      setError(err instanceof Error ? err.message : "Save failed");

    } finally {

      setSaving(false);

    }

  }



  async function toggleEnabled(rule: CategorizationRule) {

    setSaving(true);

    setError(null);

    try {

      await updateRule(rule.id, { enabled: !rule.enabled });

      await load();

    } catch (err) {

      setError(err instanceof Error ? err.message : "Update failed");

    } finally {

      setSaving(false);

    }

  }



  async function removeRule(id: string) {

    setSaving(true);

    setError(null);

    try {

      await deleteRule(id);

      if (editingId === id) {

        setEditingId(null);

        setPattern("");

      }

      await load();

    } catch (err) {

      setError(err instanceof Error ? err.message : "Delete failed");

    } finally {

      setSaving(false);

    }

  }



  function startEdit(rule: CategorizationRule) {

    setEditingId(rule.id);

    setPattern(rule.pattern);

    setCategoryId(rule.categoryId);

    setPriority(String(rule.priority));

  }



  return (

    <section className="rounded-card border border-border-subtle bg-surface-card p-5">

      <div>

        <h2 className="font-display text-lg text-text-primary">כללי סיווג</h2>

        <p className="mt-1 text-sm text-text-muted">

          תבנית טקסט, קטגוריה יעד, עדיפות — עם תצוגה מקדימה של התאמות

        </p>

      </div>



      {error ? <p className="mt-3 text-sm text-red-500">{error}</p> : null}



      {loading ? (

        <p className="mt-4 text-sm text-text-muted">טוען כללים…</p>

      ) : (

        <>

          {rules.length > 0 ? (

            <ul className="mt-4 space-y-2">

              {rules.map((rule) => (

                <li

                  key={rule.id}

                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-elevated px-3 py-2 text-sm"

                >

                  <div className="min-w-0 flex-1">

                    <p className="font-medium text-text-primary">

                      <bdi dir="ltr">{rule.pattern}</bdi>

                    </p>

                    <p className="text-xs text-text-muted">

                      {categoryNameById.get(rule.categoryId) ?? rule.categoryId} · עדיפות{" "}

                      {rule.priority}

                      {rule.enabled ? "" : " · מושבת"}

                    </p>

                  </div>

                  <div className="flex shrink-0 gap-2">

                    <button

                      type="button"

                      disabled={saving}

                      onClick={() => void toggleEnabled(rule)}

                      className="text-xs text-text-secondary"

                    >

                      {rule.enabled ? "השבת" : "הפעל"}

                    </button>

                    <button

                      type="button"

                      disabled={saving}

                      onClick={() => startEdit(rule)}

                      className="text-xs text-brand-blue-500"

                    >

                      ערוך

                    </button>

                    <button

                      type="button"

                      disabled={saving}

                      onClick={() => void removeRule(rule.id)}

                      className="text-xs text-red-500"

                    >

                      מחק

                    </button>

                  </div>

                </li>

              ))}

            </ul>

          ) : (

            <p className="mt-4 text-sm text-text-muted">אין כללים</p>

          )}



          <form onSubmit={(e) => void handleCreate(e)} className="mt-4 space-y-3">

            <p className="text-sm font-medium text-text-primary">

              {editingId ? "עריכת כלל" : "כלל חדש"}

            </p>

            <input

              value={pattern}

              onChange={(e) => setPattern(e.target.value)}

              placeholder="תבנית (למשל shufersal)"

              className="min-h-11 w-full rounded-lg border border-border-subtle bg-surface-bg px-3 text-sm"

              dir="ltr"

            />

            {pattern.trim() ? (

              <p className="text-xs text-text-muted">

                {previewPending

                  ? "בודק התאמות…"

                  : matchCount !== null

                    ? `יתאים ל־${matchCount} עסקאות`

                    : null}

              </p>

            ) : null}

            <div className="flex flex-wrap gap-3">

              <select

                value={categoryId}

                onChange={(e) => setCategoryId(e.target.value)}

                className="min-h-11 min-w-48 rounded-lg border border-border-subtle bg-surface-bg px-3 text-sm"

              >

                {categories.map((category) => (

                  <option key={category.id} value={category.id}>

                    {category.name}

                  </option>

                ))}

              </select>

              <input

                type="number"

                value={priority}

                onChange={(e) => setPriority(e.target.value)}

                className="min-h-11 w-28 rounded-lg border border-border-subtle bg-surface-bg px-3 text-sm"

                placeholder="עדיפות"

              />

              <button

                type="submit"

                disabled={saving || !pattern.trim() || !categoryId}

                className="rounded-lg bg-brand-orange-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"

              >

                {saving ? "שומר…" : editingId ? "עדכון כלל" : "הוספת כלל"}

              </button>

              {editingId ? (

                <button

                  type="button"

                  onClick={() => {

                    setEditingId(null);

                    setPattern("");

                    setPriority("10");

                  }}

                  className="px-3 text-sm text-text-muted"

                >

                  ביטול

                </button>

              ) : null}

            </div>

          </form>

        </>

      )}

    </section>

  );

}


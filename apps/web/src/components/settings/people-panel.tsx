"use client";

/**
 * Household members CRUD — settings tab owned by Wave 1 Track B.
 */
import type { Person } from "@moneytrack/contracts";
import { Pencil, Trash2, UserPlus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  createPerson,
  deletePerson,
  fetchPeople,
  updatePerson,
} from "@/lib/api-client";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Icon } from "@/components/ui/icon";
import { LabelledField } from "@/components/ui/labelled-field";
import { useToast } from "@/components/ui/toast";

const inputClass =
  "min-h-11 w-full rounded-lg border border-border-subtle bg-surface-bg px-3 text-sm";

export function PeoplePanel() {
  const { showToast } = useToast();
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [isChild, setIsChild] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editIsChild, setEditIsChild] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Person | null>(null);

  /** Silent after the first fetch — see the note in settings/rules-panel.tsx. */
  const load = useCallback(async () => {
    try {
      setPeople(await fetchPeople());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = displayName.trim();
    if (!trimmed) return;

    setSaving(true);
    try {
      await createPerson({ displayName: trimmed, isChild });
      setDisplayName("");
      setIsChild(false);
      await load();
      showToast("בן משפחה נוסף", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "שגיאה בשמירה", "error");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(person: Person) {
    setEditingId(person.id);
    setEditName(person.displayName);
    setEditIsChild(person.isChild);
  }

  async function handleSaveEdit(personId: string) {
    const trimmed = editName.trim();
    if (!trimmed) return;

    setSaving(true);
    try {
      await updatePerson(personId, { displayName: trimmed, isChild: editIsChild });
      setEditingId(null);
      await load();
      showToast("עודכן בהצלחה", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "שגיאה בעדכון", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;

    setSaving(true);
    try {
      await deletePerson(deleteTarget.id);
      setDeleteTarget(null);
      await load();
      showToast("נמחק בהצלחה", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "שגיאה במחיקה";
      showToast(message, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-card border border-border-subtle bg-surface-card p-5">
      <h2 className="font-display text-lg text-text-primary">בני משפחה</h2>
      <p className="mt-1 text-sm text-text-muted">ניהול חברי המשק הביתי לשיוך כרטיסים וחשבונות</p>

      {loading ? (
        <p className="mt-4 text-sm text-text-muted">טוען…</p>
      ) : (
        <>
          {people.length > 0 ? (
            <ul className="mt-4 space-y-2">
              {people.map((person) => (
                <li
                  key={person.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-surface-elevated px-3 py-2"
                >
                  {editingId === person.id ? (
                    <div className="flex flex-1 flex-wrap items-center gap-2">
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="min-h-10 flex-1 rounded-lg border border-border-subtle bg-surface-bg px-3 text-sm"
                      />
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={editIsChild}
                          onChange={(e) => setEditIsChild(e.target.checked)}
                        />
                        ילד/ה
                      </label>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void handleSaveEdit(person.id)}
                        className="rounded-lg bg-brand-blue-500 px-3 py-1.5 text-sm text-white disabled:opacity-60"
                      >
                        שמירה
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="rounded-lg border border-border-subtle px-3 py-1.5 text-sm"
                      >
                        ביטול
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="text-sm">
                        <span className="font-medium text-text-primary">{person.displayName}</span>
                        {person.isChild ? (
                          <span className="ms-2 rounded-full bg-brand-blue-500/10 px-2 py-0.5 text-xs text-brand-blue-500">
                            ילד/ה
                          </span>
                        ) : null}
                      </div>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => startEdit(person)}
                          className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-sm text-text-secondary hover:bg-surface-card"
                          aria-label={`עריכת ${person.displayName}`}
                        >
                          <Icon icon={Pencil} size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(person)}
                          className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-sm text-brand-orange-500 hover:bg-brand-orange-500/10"
                          aria-label={`מחיקת ${person.displayName}`}
                        >
                          <Icon icon={Trash2} size={14} />
                        </button>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-text-muted">אין בני משפחה רשומים</p>
          )}

          <form onSubmit={(e) => void handleCreate(e)} className="mt-6 space-y-3 border-t border-border-subtle pt-4">
            <h3 className="flex items-center gap-2 text-sm font-medium text-text-primary">
              <Icon icon={UserPlus} size={16} />
              הוספת בן משפחה
            </h3>
            <div className="flex flex-wrap gap-3">
              <div className="min-w-[12rem] flex-1">
                <LabelledField id="person-name" label="שם">
                  <input
                    id="person-name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className={inputClass}
                    placeholder="לדוגמה: דנה"
                  />
                </LabelledField>
              </div>
              <label className="flex min-h-11 items-center gap-2 self-end text-sm">
                <input
                  type="checkbox"
                  checked={isChild}
                  onChange={(e) => setIsChild(e.target.checked)}
                />
                ילד/ה
              </label>
              <button
                type="submit"
                disabled={saving || !displayName.trim()}
                className="min-h-11 self-end rounded-lg bg-brand-blue-500 px-4 text-sm font-medium text-white disabled:opacity-60"
              >
                {saving ? "שומר…" : "הוספה"}
              </button>
            </div>
          </form>
        </>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="מחיקת בן משפחה"
        message={
          deleteTarget
            ? `למחוק את ${deleteTarget.displayName}? לא ניתן למחוק בן משפחה שמשויך לכרטיס.`
            : ""
        }
        confirmLabel="מחיקה"
        tone="danger"
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </section>
  );
}

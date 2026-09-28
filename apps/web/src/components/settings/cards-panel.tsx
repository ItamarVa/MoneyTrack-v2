"use client";

/**
 * Credit cards CRUD — settings tab owned by Wave 1 Track B.
 */
import type { Account, Card, Person } from "@moneytrack/contracts";
import { CreditCard, Pencil, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createCard,
  deleteCard,
  fetchAccounts,
  fetchCards,
  fetchPeople,
  updateCard,
} from "@/lib/api-client";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Icon } from "@/components/ui/icon";
import { LabelledField } from "@/components/ui/labelled-field";
import { useToast } from "@/components/ui/toast";

const inputClass =
  "min-h-11 w-full rounded-lg border border-border-subtle bg-surface-bg px-3 text-sm";
const selectClass =
  "min-h-11 w-full rounded-lg border border-border-subtle bg-surface-bg px-3 text-sm";

export function CardsPanel() {
  const { showToast } = useToast();
  const [cards, setCards] = useState<Card[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [last4, setLast4] = useState("");
  const [brand, setBrand] = useState("");
  const [note, setNote] = useState("");
  const [cardholderPersonId, setCardholderPersonId] = useState("");
  const [settlementAccountId, setSettlementAccountId] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Card | null>(null);

  const personNames = useMemo(
    () => new Map(people.map((person) => [person.id, person.displayName])),
    [people],
  );
  const accountNames = useMemo(
    () => new Map(accounts.map((account) => [account.id, account.displayName])),
    [accounts],
  );

  /** Silent after the first fetch — see the note in settings/rules-panel.tsx. */
  const load = useCallback(async () => {
    try {
      const [cardRows, peopleRows, accountRows] = await Promise.all([
        fetchCards(),
        fetchPeople(),
        fetchAccounts(),
      ]);
      setCards(cardRows);
      setPeople(peopleRows);
      setAccounts(accountRows);
      setCardholderPersonId((current) => current || peopleRows[0]?.id || "");
      setSettlementAccountId((current) => current || accountRows[0]?.id || "");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    const trimmedName = displayName.trim();
    const trimmedLast4 = last4.trim();
    if (!trimmedName || trimmedLast4.length !== 4 || !cardholderPersonId || !settlementAccountId) {
      return;
    }

    setSaving(true);
    try {
      await createCard({
        displayName: trimmedName,
        last4: trimmedLast4,
        cardholderPersonId,
        settlementAccountId,
        brand: brand.trim() || null,
        note: note.trim() || null,
      });
      setDisplayName("");
      setLast4("");
      setBrand("");
      setNote("");
      await load();
      showToast("כרטיס נוסף", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "שגיאה בשמירה", "error");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(card: Card) {
    setEditingId(card.id);
    setDisplayName(card.displayName);
    setLast4(card.last4);
    setBrand(card.brand ?? "");
    setNote(card.note ?? "");
    setCardholderPersonId(card.cardholderPersonId);
  }

  async function handleSaveEdit(cardId: string) {
    const trimmedName = displayName.trim();
    const trimmedLast4 = last4.trim();
    if (!trimmedName || trimmedLast4.length !== 4 || !cardholderPersonId) {
      return;
    }

    setSaving(true);
    try {
      await updateCard(cardId, {
        displayName: trimmedName,
        last4: trimmedLast4,
        cardholderPersonId,
        brand: brand.trim() || null,
        note: note.trim() || null,
      });
      setEditingId(null);
      setDisplayName("");
      setLast4("");
      setBrand("");
      setNote("");
      await load();
      showToast("עודכן בהצלחה", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "שגיאה בעדכון", "error");
    } finally {
      setSaving(false);
    }
  }

  function cancelEdit() {
    setEditingId(null);
    setDisplayName("");
    setLast4("");
    setBrand("");
    setNote("");
  }

  async function handleDelete() {
    if (!deleteTarget) return;

    setSaving(true);
    try {
      await deleteCard(deleteTarget.id);
      setDeleteTarget(null);
      await load();
      showToast("נמחק בהצלחה", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "שגיאה במחיקה", "error");
    } finally {
      setSaving(false);
    }
  }

  const formDisabled = people.length === 0 || accounts.length === 0;

  return (
    <section className="rounded-card border border-border-subtle bg-surface-card p-5">
      <h2 className="font-display text-lg text-text-primary">כרטיסי אשראי</h2>
      <p className="mt-1 text-sm text-text-muted">ניהול כרטיסים ושיוך לחשבון חיוב ולבעלים</p>

      {loading ? (
        <p className="mt-4 text-sm text-text-muted">טוען…</p>
      ) : (
        <>
          {formDisabled ? (
            <p className="mt-4 text-sm text-brand-orange-500">
              יש להוסיף בני משפחה וחשבון חיוב לפני יצירת כרטיס.
            </p>
          ) : null}

          {cards.length > 0 ? (
            <ul className="mt-4 space-y-2">
              {cards.map((card) => (
                <li
                  key={card.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-surface-elevated px-3 py-2 text-sm"
                >
                  <div>
                    <p className="font-medium text-text-primary">{card.displayName}</p>
                    <p className="mt-0.5 text-xs text-text-muted">
                      <bdi dir="ltr">•••• {card.last4}</bdi>
                      {card.brand ? ` · ${card.brand}` : ""}
                      {" · "}
                      {personNames.get(card.cardholderPersonId) ?? "—"}
                      {" · "}
                      {accountNames.get(card.settlementAccountId) ?? "—"}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => startEdit(card)}
                      className="inline-flex min-h-9 items-center rounded-lg px-2 text-text-secondary hover:bg-surface-card"
                      aria-label={`עריכת ${card.displayName}`}
                    >
                      <Icon icon={Pencil} size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(card)}
                      className="inline-flex min-h-9 items-center rounded-lg px-2 text-brand-orange-500 hover:bg-brand-orange-500/10"
                      aria-label={`מחיקת ${card.displayName}`}
                    >
                      <Icon icon={Trash2} size={14} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-text-muted">אין כרטיסים רשומים</p>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (editingId) void handleSaveEdit(editingId);
              else void handleCreate(e);
            }}
            className="mt-6 space-y-3 border-t border-border-subtle pt-4"
          >
            <h3 className="flex items-center gap-2 text-sm font-medium text-text-primary">
              <Icon icon={CreditCard} size={16} />
              {editingId ? "עריכת כרטיס" : "הוספת כרטיס"}
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <LabelledField id="card-name" label="שם תצוגה">
                <input
                  id="card-name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className={inputClass}
                  disabled={formDisabled}
                />
              </LabelledField>
              <LabelledField id="card-last4" label="4 ספרות אחרונות">
                <input
                  id="card-last4"
                  value={last4}
                  onChange={(e) => setLast4(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  inputMode="numeric"
                  maxLength={4}
                  className={inputClass}
                  disabled={formDisabled}
                  dir="ltr"
                />
              </LabelledField>
              <LabelledField id="card-holder" label="בעל/ת הכרטיס">
                <select
                  id="card-holder"
                  value={cardholderPersonId}
                  onChange={(e) => setCardholderPersonId(e.target.value)}
                  className={selectClass}
                  disabled={formDisabled}
                >
                  {people.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.displayName}
                    </option>
                  ))}
                </select>
              </LabelledField>
              <LabelledField
                id="card-account"
                label="חשבון חיוב"
                hint={editingId ? "לא ניתן לשנות חשבון חיוב בעריכה" : undefined}
              >
                <select
                  id="card-account"
                  value={settlementAccountId}
                  onChange={(e) => setSettlementAccountId(e.target.value)}
                  className={selectClass}
                  disabled={formDisabled || editingId !== null}
                >
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.displayName}
                    </option>
                  ))}
                </select>
              </LabelledField>
              <LabelledField id="card-brand" label="מותג (אופציונלי)">
                <input
                  id="card-brand"
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  className={inputClass}
                  disabled={formDisabled}
                  placeholder="Visa, Isracard…"
                />
              </LabelledField>
              <LabelledField id="card-note" label="הערה (אופציונלי)">
                <input
                  id="card-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className={inputClass}
                  disabled={formDisabled}
                />
              </LabelledField>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={saving || formDisabled || !displayName.trim() || last4.length !== 4}
                className="min-h-11 rounded-lg bg-brand-blue-500 px-4 text-sm font-medium text-white disabled:opacity-60"
              >
                {saving ? "שומר…" : editingId ? "שמירת שינויים" : "הוספת כרטיס"}
              </button>
              {editingId ? (
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="min-h-11 rounded-lg border border-border-subtle px-4 text-sm"
                >
                  ביטול
                </button>
              ) : null}
            </div>
          </form>
        </>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="מחיקת כרטיס"
        message={deleteTarget ? `למחוק את ${deleteTarget.displayName}?` : ""}
        confirmLabel="מחיקה"
        tone="danger"
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </section>
  );
}

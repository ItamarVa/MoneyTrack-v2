"use client";

import { MIN_PASSWORD_LENGTH } from "@moneytrack/contracts";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { apiUrl } from "@/lib/base-path";
import { DarkModeToggle } from "@/components/dark-mode-toggle";

const FIELD_CLASS =
  "w-full rounded-lg border border-border-strong bg-surface-bg px-4 py-3 text-text-primary transition placeholder:text-text-muted focus:border-brand-blue-500 focus:outline-none focus:ring-2 focus:ring-brand-blue-500/25";

const MIN_LENGTH = MIN_PASSWORD_LENGTH;

export default function ChangePasswordPage() {
  const router = useRouter();
  const currentRef = useRef<HTMLInputElement>(null);
  const nextRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);
  const [showPasswords, setShowPasswords] = useState(false);
  const [error, setError] = useState("");
  const [required, setRequired] = useState(true);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch(apiUrl("/api/auth/session"))
      .then((r) => r.json())
      .then((data: { user?: { mustChangePassword?: boolean } }) => {
        setRequired(data.user?.mustChangePassword ?? true);
      })
      .catch(() => undefined);
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const currentPassword = currentRef.current?.value ?? "";
    const newPassword = nextRef.current?.value ?? "";
    const confirmPassword = confirmRef.current?.value ?? "";

    if (!currentPassword || !newPassword) {
      setError("יש למלא את כל השדות.");
      return;
    }
    if (newPassword.length < MIN_LENGTH) {
      setError(`הסיסמה החדשה חייבת להכיל לפחות ${MIN_LENGTH} תווים.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("הסיסמה החדשה ואישור הסיסמה אינם זהים.");
      return;
    }
    if (newPassword === currentPassword) {
      setError("הסיסמה החדשה חייבת להיות שונה מהסיסמה הנוכחית.");
      return;
    }

    setError("");
    setLoading(true);

    try {
      const response = await fetch(apiUrl("/api/auth/password"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      if (!response.ok) {
        const { code } = (await response.json().catch(() => ({}))) as { code?: string };

        // A signed-out session also answers 401; saying "wrong password" there
        // would send the user hunting for a problem that does not exist.
        if (code === "unauthorized") {
          router.replace("/login?expired=1");
          return;
        }

        const messages: Record<string, string> = {
          auth_failed: "הסיסמה הנוכחית שגויה.",
          validation_error: `הסיסמה החדשה אינה עומדת בדרישות. נדרשים לפחות ${MIN_LENGTH} תווים.`,
          password_too_common: "הסיסמה הזו מופיעה ברשימת הסיסמאות הנפוצות. יש לבחור סיסמה אחרת.",
          password_too_similar: "הסיסמה החדשה דומה מדי לשם המשתמש או לשם האפליקציה.",
        };
        setError(
          messages[code ?? ""] ?? "לא ניתן היה לעדכן את הסיסמה. נסו שוב.",
        );
        setLoading(false);
        currentRef.current?.focus();
        currentRef.current?.select();
        return;
      }

      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("לא ניתן להתחבר לשרת כעת. נסו שוב.");
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-surface-bg px-4 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,color-mix(in_srgb,var(--brand-blue-500)_14%,transparent),transparent_55%),radial-gradient(circle_at_bottom_left,color-mix(in_srgb,var(--brand-orange-500)_12%,transparent),transparent_50%)]"
      />

      <div className="absolute end-4 top-4">
        <DarkModeToggle />
      </div>

      <div className="relative w-full max-w-md">
        <div className="rounded-card border border-border-subtle bg-surface-card p-8 shadow-soft sm:p-10">
          <div className="mb-8 flex flex-col items-center">
            <BrandLogo size="lg" stacked priority />
            <div className="mt-6 h-px w-16 bg-brand-orange-500/60" />
          </div>

          {required ? (
            <div className="mb-6 rounded-lg border border-brand-orange-500/40 bg-brand-orange-500/10 p-4">
              <p className="text-sm font-semibold text-text-primary">בחירת סיסמה קבועה</p>
              <p className="mt-1 text-sm text-text-muted">
                החשבון עדיין משתמש בסיסמה הראשונית. יש לבחור סיסמה אישית כדי להמשיך.
              </p>
            </div>
          ) : (
            <p className="mb-6 text-center text-sm text-text-muted">החלפת סיסמה</p>
          )}

          <form className="space-y-5" onSubmit={onSubmit} noValidate>
            <div>
              <label htmlFor="current" className="mb-2 block text-sm font-medium text-text-primary">
                הסיסמה הנוכחית
              </label>
              <input
                ref={currentRef}
                id="current"
                name="current-password"
                type={showPasswords ? "text" : "password"}
                autoComplete="current-password"
                defaultValue=""
                className={FIELD_CLASS}
                placeholder="••••••••"
                dir="ltr"
              />
            </div>

            <div>
              <label htmlFor="next" className="mb-2 block text-sm font-medium text-text-primary">
                סיסמה חדשה
              </label>
              <input
                ref={nextRef}
                id="next"
                name="new-password"
                type={showPasswords ? "text" : "password"}
                autoComplete="new-password"
                defaultValue=""
                className={FIELD_CLASS}
                placeholder="••••••••"
                dir="ltr"
              />
              <p className="mt-2 text-xs text-text-muted">לפחות {MIN_LENGTH} תווים.</p>
            </div>

            <div>
              <label htmlFor="confirm" className="mb-2 block text-sm font-medium text-text-primary">
                אישור הסיסמה החדשה
              </label>
              <input
                ref={confirmRef}
                id="confirm"
                name="confirm-password"
                type={showPasswords ? "text" : "password"}
                autoComplete="new-password"
                defaultValue=""
                className={FIELD_CLASS}
                placeholder="••••••••"
                dir="ltr"
              />
            </div>

            <label className="flex items-center gap-2 text-xs text-text-muted">
              <input
                type="checkbox"
                checked={showPasswords}
                onChange={(e) => setShowPasswords(e.target.checked)}
                className="h-4 w-4 rounded border-border-strong"
              />
              הצגת הסיסמאות
            </label>

            {error ? (
              <p className="text-sm text-brand-orange-500" role="alert">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-brand-orange-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-orange-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-orange-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "שומר…" : "שמירת הסיסמה החדשה"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

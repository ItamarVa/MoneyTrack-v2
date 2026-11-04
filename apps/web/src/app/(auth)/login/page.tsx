"use client";

import Image from "next/image";
import { Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { apiUrl, assetUrl } from "@/lib/base-path";
import { DarkModeToggle } from "@/components/dark-mode-toggle";

const FIELD_CLASS =
  "w-full rounded-lg border border-border-strong bg-surface-bg px-4 py-3 text-text-primary transition placeholder:text-text-muted focus:border-brand-blue-500 focus:outline-none focus:ring-2 focus:ring-brand-blue-500/25";

const SUBMIT_DEBOUNCE_MS = 800;

type LockoutState = {
  code: "account_locked" | "ip_throttled";
  retryAfterSeconds: number;
};

function formatLockoutWait(totalSeconds: number): string {
  const minutes = Math.ceil(totalSeconds / 60);
  if (minutes <= 1) {
    return "דקה";
  }
  return `${minutes} דקות`;
}

export default function LoginPage() {
  const router = useRouter();
  // The fields are uncontrolled on purpose: browser autofill writes straight to
  // the DOM without firing React events, so React state can go stale and the
  // form would submit empty credentials.
  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const lastSubmitAtRef = useRef(0);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [lockout, setLockout] = useState<LockoutState | null>(null);
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("expired")) {
      setNotice("החיבור הקודם הסתיים. יש להתחבר מחדש.");
    }
  }, []);

  useEffect(() => {
    if (!lockout || countdown <= 0) {
      return;
    }

    const timer = window.setInterval(() => {
      setCountdown((current) => {
        if (current <= 1) {
          setLockout(null);
          return 0;
        }
        return current - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [lockout, countdown]);

  function clearForm() {
    if (usernameRef.current) usernameRef.current.value = "";
    if (passwordRef.current) passwordRef.current.value = "";
    setError("");
    setLockout(null);
    setCountdown(0);
    usernameRef.current?.focus();
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const now = Date.now();
    if (loading || now - lastSubmitAtRef.current < SUBMIT_DEBOUNCE_MS) {
      return;
    }
    lastSubmitAtRef.current = now;

    const username = usernameRef.current?.value.trim() ?? "";
    const password = passwordRef.current?.value ?? "";

    if (!username || !password) {
      setError("יש למלא שם משתמש וסיסמה.");
      return;
    }

    if (lockout && countdown > 0) {
      return;
    }

    setError("");
    setLockout(null);
    setCountdown(0);
    setLoading(true);

    try {
      const response = await fetch(apiUrl("/api/auth/login"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const result = (await response.json()) as {
        user?: { mustChangePassword?: boolean };
        code?: string;
        retryAfterSeconds?: number;
      };

      if (!response.ok) {
        if (result.code === "account_locked" || result.code === "ip_throttled") {
          const retryAfterSeconds = Math.max(0, result.retryAfterSeconds ?? 0);
          setLockout({ code: result.code, retryAfterSeconds });
          setCountdown(retryAfterSeconds);
          setError("");
        } else {
          setError(
            "שם משתמש או סיסמה שגויים. לאחר חמישה ניסיונות שגויים הכניסה נחסמת ל-15 דקות.",
          );
        }
        setLoading(false);
        passwordRef.current?.focus();
        passwordRef.current?.select();
        return;
      }

      router.push(result.user?.mustChangePassword ? "/change-password" : "/dashboard");
    } catch {
      setError("לא ניתן להתחבר כעת. נסה שוב.");
      setLoading(false);
    }
  }

  const lockoutMessage =
    lockout && countdown > 0
      ? lockout.code === "account_locked"
        ? `הכניסה לחשבון נחסמה — נסה שוב בעוד ${formatLockoutWait(countdown)}.`
        : `יותר מדי ניסיונות כניסה מהמחשב הזה — נסה שוב בעוד ${formatLockoutWait(countdown)}.`
      : null;

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-surface-bg px-4 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,color-mix(in_srgb,var(--brand-blue-500)_14%,transparent),transparent_55%),radial-gradient(circle_at_bottom_left,color-mix(in_srgb,var(--brand-orange-500)_12%,transparent),transparent_50%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -end-32 -top-32 opacity-[0.06] dark:opacity-[0.09]"
      >
        <Image src={assetUrl("/brand/mark.png")} alt="" width={420} height={420} />
      </div>

      <div className="absolute end-4 top-4">
        <DarkModeToggle />
      </div>

      <div className="relative w-full max-w-md">
        <div className="rounded-card border border-border-subtle bg-surface-card p-8 shadow-soft sm:p-10">
          <div className="mb-8 flex flex-col items-center">
            <BrandLogo size="lg" stacked priority />
            <div className="mt-6 h-px w-16 bg-brand-orange-500/60" />
          </div>

          {notice ? (
            <p className="mb-6 rounded-lg border border-brand-blue-500/40 bg-brand-blue-500/10 p-3 text-sm text-text-primary">
              {notice}
            </p>
          ) : null}

          <form className="space-y-5" onSubmit={onSubmit} noValidate>
            <div>
              <label htmlFor="username" className="mb-2 block text-sm font-medium text-text-primary">
                שם משתמש
              </label>
              <input
                ref={usernameRef}
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                defaultValue=""
                className={FIELD_CLASS}
                placeholder="admin"
                dir="ltr"
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-2 block text-sm font-medium text-text-primary">
                סיסמה
              </label>
              <div className="relative" dir="ltr">
                <input
                  ref={passwordRef}
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="off"
                  defaultValue=""
                  className={`${FIELD_CLASS} pr-20`}
                  placeholder="••••••••"
                  dir="ltr"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 z-10 flex items-center rounded-e-lg px-3 text-text-secondary transition hover:bg-surface-elevated/80 hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-blue-500"
                  aria-label={showPassword ? "הסתרת הסיסמה" : "הצגת הסיסמה"}
                >
                  {showPassword ? (
                    <EyeOff size={20} strokeWidth={1.75} aria-hidden />
                  ) : (
                    <Eye size={20} strokeWidth={1.75} aria-hidden />
                  )}
                </button>
              </div>
            </div>

            {lockoutMessage ? (
              <div className="space-y-2" role="alert">
                <p className="text-sm text-brand-orange-500">{lockoutMessage}</p>
                {lockout?.code === "account_locked" ? (
                  <p className="text-xs text-text-muted">
                    שכחת סיסמה? הרץ Reset-Password.bat מתיקיית MoneyTrack.
                  </p>
                ) : null}
              </div>
            ) : null}

            {error ? (
              <p className="text-sm text-brand-orange-500" role="alert">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={loading || (lockout !== null && countdown > 0)}
              className="w-full rounded-lg bg-brand-orange-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-orange-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-orange-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "מתחבר…" : lockout && countdown > 0 ? `נסה שוב בעוד ${countdown} שנ׳` : "כניסה"}
            </button>

            <button
              type="button"
              onClick={clearForm}
              className="w-full text-center text-xs text-text-muted underline-offset-4 transition hover:text-text-primary hover:underline"
            >
              ניקוי השדות (אם הדפדפן מילא פרטים אחרים)
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

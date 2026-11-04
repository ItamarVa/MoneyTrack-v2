"use client";

import { useState } from "react";
import { submitSyncOtp } from "@/lib/api-client";

type OtpModalProps = {
  open: boolean;
  jobId: string;
  prompt: string | null;
  onClose: () => void;
  onSubmitted: () => void;
};

export function OtpModal({ open, jobId, prompt, onClose, onSubmitted }: OtpModalProps) {
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!otp.trim()) {
      setError("נא להזין קוד");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await submitSyncOtp(jobId, otp.trim());
      setOtp("");
      onSubmitted();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בשליחה");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-brand-navy-900/55 p-4 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="otp-title"
    >
      <div className="w-full max-w-md rounded-card border border-border-subtle bg-surface-card shadow-soft">
        <div className="border-b border-border-subtle px-5 py-4">
          <h2 id="otp-title" className="font-display text-xl text-text-primary">
            אימות חד-פעמי
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            {prompt ?? "הזינו את הקוד שקיבלתם מהבנק"}
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-text-primary">קוד OTP</span>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              className="min-h-11 w-full rounded-lg border border-border-subtle bg-surface-bg px-3 text-center text-base tracking-widest"
              dir="ltr"
              required
            />
          </label>
          {error ? (
            <p className="text-sm text-brand-orange-500">{error}</p>
          ) : null}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 min-w-11 flex-1 rounded-lg border border-border-subtle text-base"
            >
              ביטול
            </button>
            <button
              type="submit"
              disabled={saving}
              className="min-h-11 min-w-11 flex-1 rounded-lg bg-brand-orange-500 text-base font-semibold text-white disabled:opacity-50"
            >
              {saving ? "שולח…" : "אישור"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

"use client";

/**
 * Six-digit PIN entry for HA add-on re-lock (Track B wires verify API).
 */
import { useCallback, useEffect, useState } from "react";

const PIN_LENGTH = 6;

type PinPadProps = {
  title?: string;
  disabled?: boolean;
  error?: string;
  onComplete: (pin: string) => void;
};

export function PinPad({
  title = "הזינו קוד PIN",
  disabled = false,
  error,
  onComplete,
}: PinPadProps) {
  const [digits, setDigits] = useState("");

  const appendDigit = useCallback(
    (digit: string) => {
      if (disabled || digits.length >= PIN_LENGTH) {
        return;
      }
      const next = `${digits}${digit}`;
      setDigits(next);
      if (next.length === PIN_LENGTH) {
        onComplete(next);
      }
    },
    [digits, disabled, onComplete],
  );

  const backspace = useCallback(() => {
    if (disabled) {
      return;
    }
    setDigits((value) => value.slice(0, -1));
  }, [disabled]);

  useEffect(() => {
    if (error) {
      setDigits("");
    }
  }, [error]);

  return (
    <div className="mx-auto w-full max-w-xs">
      <p className="mb-4 text-center text-lg font-semibold text-text-primary">{title}</p>
      <div
        className="mb-6 flex justify-center gap-2"
        dir="ltr"
        aria-live="polite"
        aria-label="ספרות PIN"
      >
        {Array.from({ length: PIN_LENGTH }, (_, index) => (
          <span
            key={index}
            className={[
              "flex h-3 w-3 rounded-full border border-border-strong",
              index < digits.length ? "bg-brand-blue-500 dark:bg-brand-orange-400" : "bg-transparent",
            ].join(" ")}
          />
        ))}
      </div>
      {error ? (
        <p className="mb-4 text-center text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : null}
      <div className="grid grid-cols-3 gap-3" dir="ltr">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "back", "0", "ok"].map((key) => {
          if (key === "back") {
            return (
              <button
                key={key}
                type="button"
                disabled={disabled}
                onClick={backspace}
                className="min-h-12 rounded-xl border border-border-subtle bg-surface-elevated text-sm font-medium"
              >
                מחיקה
              </button>
            );
          }
          if (key === "ok") {
            return (
              <button
                key={key}
                type="button"
                disabled={disabled || digits.length !== PIN_LENGTH}
                onClick={() => onComplete(digits)}
                className="min-h-12 rounded-xl border border-brand-blue-500 bg-brand-blue-500 text-sm font-semibold text-white disabled:opacity-40 dark:border-brand-orange-400 dark:bg-brand-orange-400"
              >
                אישור
              </button>
            );
          }
          return (
            <button
              key={key}
              type="button"
              disabled={disabled}
              inputMode="numeric"
              onClick={() => appendDigit(key)}
              className="min-h-12 rounded-xl border border-border-subtle bg-surface-card text-xl font-semibold text-text-primary active:bg-surface-elevated"
            >
              {key}
            </button>
          );
        })}
      </div>
    </div>
  );
}

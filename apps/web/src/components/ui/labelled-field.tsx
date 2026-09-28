/**
 * Accessible labelled form field replacing placeholder-only inputs.
 */
import type { ReactNode } from "react";

type LabelledFieldProps = {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
};

export function LabelledField({ id, label, hint, error, children }: LabelledFieldProps) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-text-primary">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-text-muted">{hint}</p> : null}
      {error ? <p className="text-xs text-brand-orange-500">{error}</p> : null}
    </div>
  );
}

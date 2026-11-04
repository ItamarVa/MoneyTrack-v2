"use client";

/**
 * Phone-first filter chips for the alerts inbox. Native selects truncate their label at 375px
 * ("כל…"), so below md the filters render as wrapping chips instead; md+ keeps the selects in
 * alerts-page-client.tsx. Pure presentation: the page owns the filter state.
 */
import he from "@/locales/he.json";

type ChipOption<T extends string> = { value: T; label: string };

type ChipGroupProps<T extends string> = {
  label: string;
  value: T;
  options: ChipOption<T>[];
  onChange: (value: T) => void;
};

export function ChipGroup<T extends string>({ label, value, options, onChange }: ChipGroupProps<T>) {
  return (
    <div role="group" aria-label={label} className="space-y-1">
      <p className="text-xs text-text-muted">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={option.value === value}
            onClick={() => onChange(option.value)}
            className={[
              "min-h-11 whitespace-nowrap rounded-full border px-4 text-sm",
              option.value === value
                ? "border-brand-orange-500 bg-brand-orange-500 text-white"
                : "border-border-subtle bg-surface-bg text-text-secondary",
            ].join(" ")}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function allOption<T extends string>(): ChipOption<T | "all"> {
  return { value: "all", label: he.alertsUx.all };
}

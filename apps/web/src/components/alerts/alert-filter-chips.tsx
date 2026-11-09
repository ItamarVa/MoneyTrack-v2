"use client";

/**
 * Type chips with counts for the alerts inbox ("הכל 12", "חיוב כפול 3"). One wrapping row at every
 * width, so no native select truncates its label on a phone. Pure presentation: the page owns the state.
 */
type ChipOption<T extends string> = { value: T; label: string; count: number };

type ChipGroupProps<T extends string> = {
  label: string;
  value: T;
  options: ChipOption<T>[];
  onChange: (value: T) => void;
};

export function ChipGroup<T extends string>({ label, value, options, onChange }: ChipGroupProps<T>) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
          className={[
            "inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-sm",
            option.value === value
              ? "border-brand-orange-500 bg-brand-orange-500 text-white"
              : "border-border-subtle bg-surface-bg text-text-secondary",
          ].join(" ")}
        >
          {option.label}
          <span className="text-xs tabular-nums opacity-80">{option.count}</span>
        </button>
      ))}
    </div>
  );
}

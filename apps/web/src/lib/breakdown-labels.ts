/**
 * Maps engine English fallback labels to Hebrew display strings.
 * Engine returns English only; locale lives in the web layer.
 * ponytail: constants duplicated from packages/engine/src/labels.ts — do not
 * import @moneytrack/engine here; the barrel pulls sqlite into client bundles.
 */
const UNCATEGORIZED_LABEL = "Uncategorized";
const GENERAL_PERSON_LABEL = "General";
const UNKNOWN_LABEL = "Unknown";

const LABELS: Record<string, string> = {
  [UNCATEGORIZED_LABEL]: "ללא קטגוריה",
  [GENERAL_PERSON_LABEL]: "כללי",
  [UNKNOWN_LABEL]: "לא ידוע",
};

export function localizeBreakdownLabel(label: string): string {
  return LABELS[label] ?? label;
}

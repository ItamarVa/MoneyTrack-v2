/**
 * Hebrew display strings for classification chain steps. Engine/contracts carry
 * tagged data only; locale lives in the web layer (same pattern as category-insight-labels).
 */
import type { ClassificationDetailResponse } from "@moneytrack/contracts";

type ClassificationChainStep = ClassificationDetailResponse["chain"][number];

const STAGE_LABELS: Record<string, string> = {
  normalize: "נורמליזציה",
  manual: "בחירה ידנית",
  rule: "כלל סיווג",
  learned: "למידה מסוחר",
  provider: "קטגוריית ספק",
  default: "ברירת מחדל",
};

function categorySuffix(name: string | null | undefined): string {
  return name ? `: ${name}` : "";
}

/** One plain Hebrew sentence explaining why the transaction got its category. */
export function formatClassificationWhySummary(
  detail: ClassificationDetailResponse,
  categoryName?: string | null,
): string {
  const source = detail.classificationSource;
  const suffix = categorySuffix(categoryName);

  if (source === "manual") {
    return `הקטגוריה נבחרה ידנית${suffix}.`;
  }

  switch (source) {
    case "rule":
      return `הקטגוריה נקבעה לפי כלל סיווג אוטומטי${suffix}.`;
    case "learned":
      return `הקטגוריה נלמדה מעסקאות קודמות של אותו סוחר${suffix}.`;
    case "provider": {
      const providerStep = detail.chain.find((step) => step.stage === "provider" && step.matched);
      const providerLabel = providerStep?.providerCategory;
      if (providerLabel) {
        return `הקטגוריה הועברה מקטגוריית הספק "${providerLabel}"${suffix}.`;
      }
      return `הקטגוריה הועברה מקטגוריית הספק${suffix}.`;
    }
    case "default":
      return 'לא נמצאה התאמה — הקטגוריה "לא מסווג".';
    default:
      return "סיבת הסיווג לא ידועה.";
  }
}

/** Technical chain line for the optional detail toggle. */
export function formatClassificationChainStep(
  step: ClassificationChainStep,
  categoryName?: string | null,
): string {
  const stage = STAGE_LABELS[step.stage] ?? step.stage;
  const suffix = categorySuffix(categoryName);

  switch (step.stage) {
    case "normalize":
      return `${stage}: ${step.detail || "—"}`;
    case "manual":
      return step.matched
        ? `${stage}${suffix} — חוסמת אוטומציה`
        : `${stage}: לא נבחרה`;
    case "rule":
      if (!step.matched) return `${stage}: אין כלל מתאים`;
      return step.ruleId
        ? `${stage}${suffix} (כלל ${step.ruleId.slice(0, 8)}…)`
        : `${stage}${suffix}`;
    case "learned":
      if (!step.matched) return `${stage}: אין היסטוריה לסוחר`;
      return step.confidence !== null
        ? `${stage}${suffix} (ביטחון ${Math.round(step.confidence * 100)}%)`
        : `${stage}${suffix}`;
    case "provider":
      if (!step.matched) return `${stage}: אין מיפוי`;
      return step.providerCategory
        ? `${stage}: "${step.providerCategory}"${suffix}`
        : `${stage}${suffix}`;
    case "default":
      return step.matched ? `${stage}: "לא מסווג"` : `${stage}: לא בשימוש`;
    default:
      return step.matched ? `${stage}${suffix}` : `${stage}: לא התאים`;
  }
}

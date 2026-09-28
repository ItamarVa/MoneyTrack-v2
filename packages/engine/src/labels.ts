/**
 * English fallback labels returned by engine rollups and breakdown queries.
 * The web layer maps these to locale-specific display strings.
 */
export const UNCATEGORIZED_CATEGORY_ID = "00000000-0000-4000-8000-000000000001";
export const UNCATEGORIZED_LABEL = "Uncategorized";
export const GENERAL_PERSON_LABEL = "General";
export const UNKNOWN_LABEL = "Unknown";

/** Map null/ missing category rows onto the seeded uncategorized bucket id. */
export function resolveCategoryBucketId(categoryId: string | null): string {
  return categoryId ?? UNCATEGORIZED_CATEGORY_ID;
}

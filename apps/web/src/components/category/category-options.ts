/**
 * Pure helpers behind the category chooser: build the parent/child tree, filter it by a typed
 * query, and label a category with its parent. No React, so the filtering is unit-tested directly.
 * Depends on: nothing at runtime. Used by: category-chooser.tsx.
 * Gotcha: a category whose parent is missing or excluded is shown as a root, never dropped.
 */
import type { Category } from "@moneytrack/contracts";

export const PATH_SEPARATOR = " › ";

export type CategoryOption = {
  id: string;
  name: string;
  /** 0 for roots; descendants of any depth are shown flat under their root. */
  depth: number;
  /** Name of the direct parent, null for roots. */
  parentName: string | null;
  /** True when another category shares this exact name, so the parent must be shown. */
  ambiguous: boolean;
};

export type CategoryGroup = {
  root: CategoryOption;
  /** Descendants in tree order. */
  children: CategoryOption[];
};

/** Lower-case, trim, collapse whitespace; Hebrew has no case, niqqud is stripped. */
export function normalizeSearch(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[֑-ׇ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function compareCategories(a: Category, b: Category): number {
  return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "he");
}

/** Every option in tree order (root, its descendants, next root), unfiltered. */
function buildTree(categories: Category[], excludeIds: ReadonlySet<string>): CategoryGroup[] {
  const usable = categories.filter((category) => !excludeIds.has(category.id));
  const ids = new Set(usable.map((category) => category.id));
  const nameCount = new Map<string, number>();
  for (const category of usable) {
    const key = normalizeSearch(category.name);
    nameCount.set(key, (nameCount.get(key) ?? 0) + 1);
  }

  const childrenOf = new Map<string, Category[]>();
  const roots: Category[] = [];
  for (const category of usable) {
    if (category.parentId && ids.has(category.parentId)) {
      const list = childrenOf.get(category.parentId) ?? [];
      list.push(category);
      childrenOf.set(category.parentId, list);
    } else {
      roots.push(category);
    }
  }

  const byId = new Map(usable.map((category) => [category.id, category]));
  const toOption = (category: Category, depth: number): CategoryOption => ({
    id: category.id,
    name: category.name,
    depth,
    parentName:
      category.parentId && byId.has(category.parentId) ? byId.get(category.parentId)!.name : null,
    ambiguous: (nameCount.get(normalizeSearch(category.name)) ?? 0) > 1,
  });

  const visited = new Set<string>();
  const collect = (parent: Category, depth: number, into: CategoryOption[]): void => {
    for (const child of [...(childrenOf.get(parent.id) ?? [])].sort(compareCategories)) {
      // A parent cycle would otherwise recurse forever.
      if (visited.has(child.id)) continue;
      visited.add(child.id);
      into.push(toOption(child, depth));
      collect(child, depth + 1, into);
    }
  };

  return roots.sort(compareCategories).map((root) => {
    visited.add(root.id);
    const children: CategoryOption[] = [];
    collect(root, 1, children);
    return { root: toOption(root, 0), children };
  });
}

function matchesQuery(option: CategoryOption, tokens: string[]): boolean {
  const haystack = normalizeSearch(`${option.parentName ?? ""} ${option.name}`);
  return tokens.every((token) => haystack.includes(token));
}

/**
 * Groups for display. An empty query keeps everything. With a query, a child matches on its own
 * name or its parent's name; a group stays when its header or any child matches, and a matching
 * header with no matching child keeps all of its children.
 */
export function buildCategoryGroups(
  categories: Category[],
  query: string,
  options?: { excludeIds?: Iterable<string> },
): CategoryGroup[] {
  const groups = buildTree(categories, new Set(options?.excludeIds ?? []));
  const tokens = normalizeSearch(query).split(" ").filter(Boolean);
  if (tokens.length === 0) return groups;

  const result: CategoryGroup[] = [];
  for (const group of groups) {
    const rootMatches = matchesQuery(group.root, tokens);
    const matchingChildren = group.children.filter((child) => matchesQuery(child, tokens));
    if (rootMatches) {
      result.push({ root: group.root, children: matchingChildren.length > 0 ? matchingChildren : group.children });
    } else if (matchingChildren.length > 0) {
      result.push({ root: group.root, children: matchingChildren });
    }
  }
  return result;
}

/** Options in the order they appear on screen, for keyboard navigation. */
export function flattenGroups(groups: CategoryGroup[]): CategoryOption[] {
  return groups.flatMap((group) => [group.root, ...group.children]);
}

/** "Parent › Child" for a child, plain name for a root, null when the id is unknown. */
export function categoryPathLabel(categories: Category[], categoryId: string | null): string | null {
  if (!categoryId) return null;
  const byId = new Map(categories.map((category) => [category.id, category]));
  const target = byId.get(categoryId);
  if (!target) return null;
  const parent = target.parentId ? byId.get(target.parentId) : undefined;
  return parent ? `${parent.name}${PATH_SEPARATOR}${target.name}` : target.name;
}

/** Fills "{name}" placeholders of a he.json template. */
export function fillTemplate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}

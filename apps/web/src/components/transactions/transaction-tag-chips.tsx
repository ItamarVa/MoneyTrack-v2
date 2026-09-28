"use client";

import type { Tag } from "@moneytrack/contracts";

type TransactionTagChipsProps = {
  tagIds: string[];
  tagsById: Map<string, Tag>;
  compact?: boolean;
};

export function TransactionTagChips({ tagIds, tagsById, compact }: TransactionTagChipsProps) {
  if (tagIds.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1">
      {tagIds.map((tagId) => {
        const tag = tagsById.get(tagId);
        if (!tag) return null;
        return (
          <span
            key={tagId}
            className={[
              "rounded-full px-2 py-0.5 text-[10px] font-medium",
              compact ? "" : "mt-1",
            ].join(" ")}
            style={
              tag.color
                ? { backgroundColor: `${tag.color}22`, color: tag.color }
                : undefined
            }
          >
            {tag.name}
          </span>
        );
      })}
    </div>
  );
}

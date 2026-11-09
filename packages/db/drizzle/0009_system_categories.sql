-- System categories for the "kind" classification stage (packages/classify/src/system-categories.ts).
-- Reused from 0002, not created here: b1 חיסכון, c1 הכנסות, c2 העברות פנימיות, 70 ביטוח.
-- c3 is top level (not under העברות והכנסות) so an unconnected card bill is not shown as that expense category.
-- Idempotent: fixed ids, and a row is skipped when the user already has a category with
-- the same name under the same parent (we never duplicate a name; the stage matches by id
-- only, so that bucket then simply stays unused for that user).
INSERT OR IGNORE INTO categories (id, parent_id, name, sort_order, created_at)
SELECT '00000000-0000-4000-8000-0000000000c3', NULL, 'חיובי כרטיס אשראי ללא פירוט', 125, '2026-01-01T00:00:00+02:00'
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'חיובי כרטיס אשראי ללא פירוט' AND parent_id IS NULL);
--> statement-breakpoint
INSERT OR IGNORE INTO categories (id, parent_id, name, sort_order, created_at)
SELECT '00000000-0000-4000-8000-000000000043', '00000000-0000-4000-8000-000000000040', 'החזרי הלוואות ומשכנתא', 3, '2026-01-01T00:00:00+02:00'
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'החזרי הלוואות ומשכנתא' AND parent_id IS '00000000-0000-4000-8000-000000000040');
--> statement-breakpoint
INSERT OR IGNORE INTO categories (id, parent_id, name, sort_order, created_at)
SELECT '00000000-0000-4000-8000-0000000000d0', NULL, 'מיסים ועמלות', 130, '2026-01-01T00:00:00+02:00'
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'מיסים ועמלות' AND parent_id IS NULL);
--> statement-breakpoint

-- One-time re-classification so existing rows pick up the new stage and the widened kind
-- patterns. The migration runs exactly once per database, so this is the "just migrated"
-- trigger: the agent (or the web runner) drains the queued categorize_bulk job, newest month
-- first. Payload shape = ClassifyBulkPayload in apps/web/src/server/classify-jobs.ts.
INSERT OR IGNORE INTO jobs (id, kind, payload_json, status, attempts, created_at, updated_at)
SELECT '00000000-0000-4000-8000-0000000000e1', 'categorize_bulk',
  json_object(
    'periods', json((
      SELECT json_group_array(p) FROM (
        SELECT substr(charge_date, 1, 7) AS p FROM transactions
        UNION
        SELECT substr(transaction_date, 1, 7) FROM transactions
        ORDER BY p DESC
      )
    )),
    'done', 0,
    'updated', 0
  ),
  'queued', 0, '2026-01-01T00:00:00+02:00', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE EXISTS (SELECT 1 FROM transactions)
  AND NOT EXISTS (SELECT 1 FROM jobs WHERE kind = 'categorize_bulk' AND status IN ('queued', 'running'));

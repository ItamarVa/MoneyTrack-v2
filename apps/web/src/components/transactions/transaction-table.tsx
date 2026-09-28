"use client";







/**



 * Virtualized transaction table with server-driven sort, tag chips,



 * delete confirmation, and highlight support for deep links.



 */



import type {
  Account,
  AnalysisFilter,
  Card,
  Category,
  Tag,
  Transaction,
  TransactionKind,
} from "@moneytrack/contracts";



import {



  createColumnHelper,



  tableFeatures,



  useTable,



} from "@tanstack/react-table";



import { useVirtualizer } from "@tanstack/react-virtual";



import { useMemo, useRef, useState } from "react";



import { CategoryPicker } from "@/components/transactions/category-picker";



import { ClassificationWhy } from "@/components/transactions/classification-why";



import {

  TransactionColumnHeaderMenu,

  type TransactionColumnKey,

} from "@/components/transactions/transaction-column-header-menu";



import { TransactionTagChips } from "@/components/transactions/transaction-tag-chips";



import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { MobileCardList, MobileCardListItem } from "@/components/mobile";



import { useToast } from "@/components/ui/toast";



import type { TransactionSortBy, TransactionSortDir } from "@/lib/analysis-filter";



import { deleteTransaction } from "@/lib/api-client";
import { buildSourceIndex, sourceLabelFor, type SourceOption } from "@/lib/transaction-source";



import {



  amountToneClass,



  formatTransactionAmountDisplay,



} from "@/lib/transaction-amounts";







type TransactionTableProps = {



  rows: Transaction[];



  tags: Tag[];



  categories: Category[];



  accounts: Account[];



  cards: Card[];



  sources: SourceOption[];



  filter: AnalysisFilter;



  kinds?: TransactionKind[];



  highlightId?: string | null;



  sortBy: TransactionSortBy;



  sortDir: TransactionSortDir;



  onApplySort: (column: TransactionSortBy, dir: TransactionSortDir) => void;



  onApplyColumnFilter: (updates: {



    filter?: Partial<AnalysisFilter>;



    kinds?: TransactionKind[];



    freeText?: string;



  }) => void;



  /** Full refresh — the row set itself changed (delete). */



  onChanged: () => void;



  /** One row changed in place — avoids a full reload. */



  onRowChanged: (updated: Transaction) => void;



  onOpenDetail: (transactionId: string) => void;



};







const GRID_COLS = "grid-cols-[1fr_2fr_1.2fr_1fr_0.6fr_1fr_0.5fr]";







const features = tableFeatures({});



const columnHelper = createColumnHelper<typeof features, Transaction>();







function formatHebrewDate(isoDate: string): string {



  const parts = isoDate.split("-").map(Number);



  const year = parts[0] ?? 0;



  const month = parts[1] ?? 1;



  const day = parts[2] ?? 1;



  return new Intl.DateTimeFormat("he-IL").format(new Date(year, month - 1, day));



}







const KIND_LABELS: Record<string, string> = {



  expense: "הוצאה",



  income: "הכנסה",



  transfer: "העברה",



  card_settlement: "סגירה",



  refund: "זיכוי",



  loan_payment: "הלוואה",



};







const HEADER_COLUMNS: { id: string; label: string; columnKey: TransactionColumnKey }[] = [



  { id: "transactionDate", label: "תאריך", columnKey: "date" },



  { id: "descriptionRaw", label: "תיאור", columnKey: "description" },



  { id: "category", label: "קטגוריה", columnKey: "category" },



  { id: "source", label: "מקור", columnKey: "source" },



  { id: "kind", label: "סוג", columnKey: "kind" },



  { id: "amountIls", label: "סכום", columnKey: "amount" },



  { id: "actions", label: "", columnKey: "date" },



];







export function TransactionTable({



  rows,



  tags,



  categories,



  accounts,



  cards,



  sources,



  filter,



  kinds,



  highlightId,



  sortBy,



  sortDir,



  onApplySort,



  onApplyColumnFilter,



  onChanged,



  onRowChanged,



  onOpenDetail,



}: TransactionTableProps) {



  const parentRef = useRef<HTMLDivElement>(null);



  const { showToast } = useToast();



  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);



  const [deletingId, setDeletingId] = useState<string | null>(null);







  const tagsById = useMemo(() => new Map(tags.map((tag) => [tag.id, tag])), [tags]);
  const categoriesById = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories],
  );
  const sourceIndex = useMemo(() => buildSourceIndex(accounts, cards), [accounts, cards]);







  const columns = useMemo(



    () =>



      columnHelper.columns([



        columnHelper.accessor("transactionDate", {



          header: "תאריך",



          cell: (info) => {



            const row = info.row.original;



            const showCharge = row.chargeDate !== row.transactionDate;



            return (



              <div>



                <span className="text-text-secondary">{formatHebrewDate(row.transactionDate)}</span>



                {showCharge ? (



                  <p className="text-xs text-text-muted">חיוב: {formatHebrewDate(row.chargeDate)}</p>



                ) : null}



              </div>



            );



          },



        }),



        columnHelper.accessor("descriptionRaw", {



          header: "תיאור",



          cell: (info) => {



            const tagIds = info.row.original.tagIds ?? [];



            return (



              <div className="min-w-0">



                <p className="truncate font-medium text-text-primary">{info.getValue()}</p>



                {info.row.original.userNote ? (



                  <p className="truncate text-xs text-text-muted">{info.row.original.userNote}</p>



                ) : null}



                <TransactionTagChips tagIds={tagIds} tagsById={tagsById} compact />



                {info.row.original.excludedFromTotals ? (



                  <span className="mt-1 inline-block rounded-full bg-surface-elevated px-2 py-0.5 text-[10px] text-text-muted">



                    מוחרג



                  </span>



                ) : null}



              </div>



            );



          },



        }),



        columnHelper.display({



          id: "category",



          header: "קטגוריה",



          cell: ({ row }) => (



            <div className="flex items-center gap-1">



              <CategoryPicker



                transactionId={row.original.id}



                value={row.original.categoryId}



                classificationSource={row.original.classificationSource}



                categories={categories}



                onChanged={onRowChanged}



              />



              <ClassificationWhy transactionId={row.original.id} categories={categories} />



            </div>



          ),



        }),



        columnHelper.display({



          id: "source",



          header: "מקור",



          cell: ({ row }) => (



            <span className="truncate text-xs text-text-secondary">



              {sourceLabelFor(row.original, sourceIndex)}



            </span>



          ),



        }),



        columnHelper.accessor("kind", {



          header: "סוג",



          cell: (info) => (



            <span className="text-xs uppercase tracking-wide text-text-muted">



              {KIND_LABELS[info.getValue()] ?? info.getValue()}



            </span>



          ),



        }),



        columnHelper.accessor("amountIls", {



          header: "סכום",



          cell: (info) => {



            const display = formatTransactionAmountDisplay(info.row.original);



            return (



              <div>



                <bdi



                  dir="ltr"



                  className={[

                    "block min-w-[7rem] text-right font-medium tabular-nums",

                    amountToneClass(display.tone),

                  ].join(" ")}



                >



                  {display.text}



                </bdi>



                {display.secondary ? (



                  <p className="text-xs text-text-muted">



                    <bdi dir="ltr">{display.secondary}</bdi>



                  </p>



                ) : null}



              </div>



            );



          },



        }),



        columnHelper.display({



          id: "actions",



          header: "",



          cell: ({ row }) => {



            const manual = row.original.firstSeenRawId === null;



            if (!manual) return null;



            return (



              <button



                type="button"



                disabled={deletingId === row.original.id}



                onClick={(event) => {



                  event.stopPropagation();



                  setPendingDeleteId(row.original.id);



                }}



                className="rounded-md px-2 py-1 text-xs text-text-muted transition hover:bg-surface-elevated hover:text-brand-orange-500"



              >



                מחק



              </button>



            );



          },



        }),



      ]),



    [categories, deletingId, onRowChanged, sourceIndex, tagsById],



  );







  const table = useTable({ features, columns, data: rows });







  const rowVirtualizer = useVirtualizer({



    count: table.getRowModel().rows.length,



    getScrollElement: () => parentRef.current,



    estimateSize: () => 72,



    overscan: 12,



  });







  const virtualRows = rowVirtualizer.getVirtualItems();



  const totalSize = rowVirtualizer.getTotalSize();







  return (



    <>



      <MobileCardList>



        {rows.map((row) => {



          const highlighted = highlightId === row.id;



          const display = formatTransactionAmountDisplay(row);



          const tagIds = row.tagIds ?? [];



          const categoryName = row.categoryId ? categoriesById.get(row.categoryId) : null;



          return (



            <MobileCardListItem



              key={row.id}



              onClick={() => onOpenDetail(row.id)}



              className={



                highlighted ? "ring-2 ring-inset ring-brand-orange-500/40 bg-brand-orange-500/10" : ""



              }



            >



              <div id={`tx-row-${row.id}`} className="space-y-2 text-start">



                <div className="flex items-start justify-between gap-3">



                  <div className="min-w-0 flex-1">



                    <p className="truncate font-medium text-text-primary">{row.descriptionRaw}</p>



                    {row.userNote ? (



                      <p className="truncate text-xs text-text-muted">{row.userNote}</p>



                    ) : null}



                  </div>



                  <div className="shrink-0 text-end">



                    <bdi



                      dir="ltr"



                      className={[



                        "block font-medium tabular-nums",



                        amountToneClass(display.tone),



                      ].join(" ")}



                    >



                      {display.text}



                    </bdi>



                    {display.secondary ? (



                      <p className="text-xs text-text-muted">



                        <bdi dir="ltr">{display.secondary}</bdi>



                      </p>



                    ) : null}



                  </div>



                </div>



                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-secondary">



                  <span>{formatHebrewDate(row.transactionDate)}</span>



                  {categoryName ? <span className="truncate">{categoryName}</span> : null}



                  <span className="text-text-muted">{KIND_LABELS[row.kind] ?? row.kind}</span>



                  <span className="truncate">{sourceLabelFor(row, sourceIndex)}</span>



                </div>



                <TransactionTagChips tagIds={tagIds} tagsById={tagsById} compact />



                {row.excludedFromTotals ? (



                  <span className="inline-block rounded-full bg-surface-elevated px-2 py-0.5 text-[10px] text-text-muted">



                    מוחרג



                  </span>



                ) : null}



              </div>



            </MobileCardListItem>



          );



        })}



      </MobileCardList>



      <div className="hidden overflow-hidden rounded-card border border-border-subtle bg-surface-card shadow-sm md:block">



        <div



          className={`grid ${GRID_COLS} gap-3 border-b border-border-subtle bg-surface-elevated/60 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-text-muted`}



        >



          {HEADER_COLUMNS.map((column) =>



            column.id === "actions" ? (



              <div key={column.id} />



            ) : (



              <TransactionColumnHeaderMenu



                key={column.id}



                label={column.label}



                columnKey={column.columnKey}



                sortBy={sortBy}



                sortDir={sortDir}



                filter={filter}



                kinds={kinds}



                categories={categories}



                sources={sources}



                onApplySort={onApplySort}



                onApplyFilter={onApplyColumnFilter}



              />



            ),



          )}



        </div>







        <div ref={parentRef} className="max-h-[min(70vh,640px)] overflow-auto">



          <div style={{ height: totalSize, position: "relative" }}>



            {virtualRows.map((virtualRow) => {



              const row = table.getRowModel().rows[virtualRow.index];



              if (!row) return null;



              const highlighted = highlightId === row.original.id;



              return (



                <div



                  key={row.id}



                  id={`tx-row-${row.original.id}`}



                  role="button"



                  tabIndex={0}



                  onClick={() => onOpenDetail(row.original.id)}



                  onKeyDown={(event) => {



                    if (event.key === "Enter" || event.key === " ") {



                      event.preventDefault();



                      onOpenDetail(row.original.id);



                    }



                  }}



                  className={[



                    `absolute start-0 grid w-full ${GRID_COLS} gap-3 border-b border-border-subtle/70 px-4 py-3 transition cursor-pointer`,



                    highlighted



                      ? "bg-brand-orange-500/10 ring-2 ring-inset ring-brand-orange-500/40"



                      : "hover:bg-surface-elevated/40",



                  ].join(" ")}



                  style={{



                    height: virtualRow.size,



                    transform: `translateY(${virtualRow.start}px)`,



                  }}



                >



                  {row.getAllCells().map((cell) => (



                    <div



                      key={cell.id}



                      className="min-w-0 text-sm"



                      onClick={(event) => {



                        if (cell.column.id === "actions" || cell.column.id === "category") {



                          event.stopPropagation();



                        }



                      }}



                    >



                      <table.FlexRender cell={cell} />



                    </div>



                  ))}



                </div>



              );



            })}



          </div>



        </div>



      </div>







      <ConfirmDialog



        open={pendingDeleteId !== null}



        title="מחיקת עסקה"



        message="העסקה תימחק לצמיתות. פעולה זו לא ניתנת לביטול."



        confirmLabel="מחק"



        tone="danger"



        onCancel={() => setPendingDeleteId(null)}



        onConfirm={() => {



          if (!pendingDeleteId) return;



          const id = pendingDeleteId;



          setPendingDeleteId(null);



          setDeletingId(id);



          void deleteTransaction(id)



            .then(() => {



              showToast("העסקה נמחקה", "success");



              onChanged();



            })



            .catch((error) => {



              showToast(error instanceof Error ? error.message : "שגיאה במחיקה", "error");



            })



            .finally(() => setDeletingId(null));



        }}



      />



    </>



  );



}





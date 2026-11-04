/**
 * Table on md+ and stacked cards below md (Track E3 settings/classify panels).
 */
import type { ReactNode } from "react";

type PanelDataTableProps = {
  table: ReactNode;
  mobileCards: ReactNode;
};

export function PanelDataTable({ table, mobileCards }: PanelDataTableProps) {
  return (
    <>
      <div className="md:hidden">{mobileCards}</div>
      <div className="hidden overflow-x-auto md:block">{table}</div>
    </>
  );
}

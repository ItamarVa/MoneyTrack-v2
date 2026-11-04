import { HaFlowShell } from "@/components/ha/ha-flow-shell";

export default function HaNoAccessPage() {
  return (
    <HaFlowShell title="אין גישה">
      <p className="text-center text-text-secondary">
        משתמש Home Assistant זה לא ברשימת המורשים של התוסף. פנה למנהל המערכת כדי להוסיף את שם המשתמש
        בהגדרות התוסף.
      </p>
    </HaFlowShell>
  );
}

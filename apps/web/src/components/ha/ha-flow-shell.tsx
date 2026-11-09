import { BrandLogo } from "@/components/brand-logo";
import { DarkModeToggle } from "@/components/dark-mode-toggle";

type HaFlowShellProps = {
  title: string;
  children: React.ReactNode;
};

export function HaFlowShell({ title, children }: HaFlowShellProps) {
  return (
    <div className="flex min-h-screen flex-col bg-surface-bg text-text-primary">
      <header className="flex items-center justify-between px-4 py-3">
        <BrandLogo className="h-8 w-auto" />
        <DarkModeToggle />
      </header>
      <main className="flex flex-1 flex-col items-center justify-center px-4 pb-10">
        <h1 className="mb-8 text-center text-2xl font-semibold">{title}</h1>
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}

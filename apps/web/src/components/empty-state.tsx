import Image from "next/image";
import { assetUrl } from "@/lib/base-path";

type EmptyStateProps = {
  title: string;
  description: string;
  children?: React.ReactNode;
};

export function EmptyState({ title, description, children }: EmptyStateProps) {
  return (
    <section className="relative flex min-h-[320px] flex-col items-center justify-center overflow-hidden rounded-card border border-border-subtle bg-surface-card px-6 py-16 text-center shadow-sm">
      <div
        aria-hidden
        className="pointer-events-none absolute -end-16 -top-16 opacity-[0.06] dark:opacity-[0.08]"
      >
        <Image src={assetUrl("/brand/mark.png")} alt="" width={280} height={280} />
      </div>
      <h2 className="font-display text-2xl font-semibold text-text-primary">{title}</h2>
      <p className="mt-3 max-w-md text-pretty text-text-secondary">{description}</p>
      {children ? <div className="mt-6">{children}</div> : null}
    </section>
  );
}

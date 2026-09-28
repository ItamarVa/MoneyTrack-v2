import Image from "next/image";
import { assetUrl } from "@/lib/base-path";

const SIZES = {
  sm: { mark: 32, name: "text-base", tagline: "text-[11px]", gap: "gap-2.5" },
  md: { mark: 44, name: "text-xl", tagline: "text-xs", gap: "gap-3" },
  lg: { mark: 72, name: "text-3xl", tagline: "text-sm", gap: "gap-4" },
} as const;

type BrandLogoProps = {
  size?: keyof typeof SIZES;
  /** Stack the mark above the wordmark, centred. */
  stacked?: boolean;
  showTagline?: boolean;
  priority?: boolean;
  className?: string;
};

/**
 * The wordmark is live text rather than an image so it stays sharp at any size
 * and follows the light/dark theme.
 */
export function BrandLogo({
  size = "md",
  stacked = false,
  showTagline = true,
  priority = false,
  className = "",
}: BrandLogoProps) {
  const scale = SIZES[size];

  return (
    <div
      className={[
        "flex",
        stacked ? "flex-col items-center text-center" : "flex-row items-center",
        scale.gap,
        className,
      ].join(" ")}
    >
      <Image
        src={assetUrl("/brand/mark.png")}
        alt=""
        width={scale.mark}
        height={scale.mark}
        priority={priority}
        className="shrink-0 drop-shadow-sm"
        style={{ width: scale.mark, height: scale.mark }}
      />
      <div className={stacked ? "" : "min-w-0"}>
        <p
          className={`font-display ${scale.name} font-bold leading-none tracking-tight text-brand-navy-900 dark:text-white`}
          dir="ltr"
        >
          Money<span className="font-normal text-brand-blue-500 dark:text-brand-orange-400">Track</span>
        </p>
        {showTagline ? (
          <p className={`mt-1.5 ${scale.tagline} font-medium leading-tight text-text-muted`}>
            מערכת לניהול ומעקב הוצאות
          </p>
        ) : null}
      </div>
    </div>
  );
}

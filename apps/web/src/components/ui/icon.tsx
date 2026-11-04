/**
 * Consistent Lucide icon wrapper with shared sizing and stroke width.
 */
import type { LucideIcon } from "lucide-react";

type IconProps = {
  icon: LucideIcon;
  label?: string;
  size?: number;
  className?: string;
};

export function Icon({ icon: IconComponent, label, size = 20, className = "" }: IconProps) {
  return (
    <IconComponent
      size={size}
      strokeWidth={1.75}
      className={className}
      aria-hidden={label ? undefined : true}
      aria-label={label}
    />
  );
}

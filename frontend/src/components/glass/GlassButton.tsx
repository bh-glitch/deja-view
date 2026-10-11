/**
 * Glass pill / icon button (Arnav, human-requested redesign). Icon-only buttons must pass
 * `label`: it becomes the accessible name and the hover/focus tooltip.
 */
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

export interface GlassButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "primary" | "danger" | "quiet";
  size?: "md" | "sm";
  icon?: ReactNode;
  /** Icon-only: accessible name + tooltip. With children it is only the tooltip. */
  label?: string;
  tooltipSide?: "top" | "bottom";
  active?: boolean;
}

export const GlassButton = forwardRef<HTMLButtonElement, GlassButtonProps>(function GlassButton(
  {
    variant = "default",
    size = "md",
    icon,
    label,
    tooltipSide = "top",
    active,
    className = "",
    children,
    type = "button",
    ...rest
  },
  ref,
) {
  const iconOnly = !children;
  const classes = [
    "glass-btn",
    variant !== "default" ? `glass-btn--${variant}` : "",
    size === "sm" ? "glass-btn--sm" : "",
    iconOnly ? "glass-btn--icon" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button
      ref={ref}
      type={type}
      className={classes}
      aria-label={iconOnly ? label : undefined}
      data-active={active ? "true" : undefined}
      {...rest}
    >
      {icon}
      {children}
      {iconOnly && label && (
        <span aria-hidden className="glass-tip" data-side={tooltipSide}>
          {label}
        </span>
      )}
    </button>
  );
});

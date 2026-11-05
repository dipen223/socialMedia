import { forwardRef } from "react";
import styles from "./IconButton.module.css";

/**
 * A square, icon-only button. Separate from Button because icon-only controls
 * have different rules: they need a real accessible name (there's no visible
 * label to read), and they need a minimum hit area so they're tappable on a
 * phone.
 *
 * `label` is required - it becomes aria-label and the tooltip.
 */
const IconButton = forwardRef(function IconButton(
  { icon: Icon, label, variant = "ghost", size = "md", active = false, className = "", ...rest },
  ref
) {
  const classes = [
    styles.iconButton,
    styles[variant],
    styles[size],
    active ? styles.active : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      ref={ref}
      className={classes}
      aria-label={label}
      title={label}
      aria-pressed={active || undefined}
      {...rest}
    >
      <Icon className={styles.icon} aria-hidden="true" />
    </button>
  );
});

export default IconButton;

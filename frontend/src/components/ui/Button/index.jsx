import { forwardRef } from "react";
import { Loader2 } from "lucide-react";
import styles from "./Button.module.css";

/**
 * The one button in the app.
 *
 * variant  primary | secondary | ghost | danger
 * size     sm | md | lg
 * icon     a lucide component, rendered before the label
 * loading  swaps the icon for a spinner and disables interaction
 *
 * forwardRef so it still works inside things that need the node (menus,
 * tooltips, focus management).
 */
const Button = forwardRef(function Button(
  {
    variant = "primary",
    size = "md",
    icon: Icon,
    iconAfter: IconAfter,
    loading = false,
    fullWidth = false,
    disabled,
    className = "",
    children,
    ...rest
  },
  ref
) {
  const classes = [
    styles.button,
    styles[variant],
    styles[size],
    fullWidth ? styles.fullWidth : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      ref={ref}
      className={classes}
      disabled={disabled || loading}
      // Tells screen readers the control is busy rather than just dead.
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <Loader2 className={styles.spinner} aria-hidden="true" />
      ) : (
        Icon && <Icon className={styles.icon} aria-hidden="true" />
      )}
      {children && <span className={styles.label}>{children}</span>}
      {IconAfter && !loading && <IconAfter className={styles.icon} aria-hidden="true" />}
    </button>
  );
});

export default Button;

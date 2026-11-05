import { forwardRef, useId } from "react";
import styles from "./Field.module.css";

/**
 * Text input and textarea with the accessibility wiring that's easy to skip:
 * a real <label> tied to the control by id, and errors linked via
 * aria-describedby so screen readers actually announce them.
 *
 * useId() generates the id, so callers never have to invent unique ones.
 */
function FieldBase({ as = "input", label, error, hint, id, className = "", ...rest }, ref) {
  const generatedId = useId();
  const fieldId = id || generatedId;
  const messageId = `${fieldId}-message`;
  const Control = as === "textarea" ? "textarea" : "input";

  return (
    <div className={[styles.field, className].filter(Boolean).join(" ")}>
      {label && (
        <label className={styles.label} htmlFor={fieldId}>
          {label}
        </label>
      )}

      <Control
        ref={ref}
        id={fieldId}
        className={[styles.control, error ? styles.invalid : ""].filter(Boolean).join(" ")}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? messageId : undefined}
        {...rest}
      />

      {(error || hint) && (
        <p
          id={messageId}
          className={error ? styles.error : styles.hint}
          // Errors appear after a failed action, so they need announcing.
          role={error ? "alert" : undefined}
        >
          {error || hint}
        </p>
      )}
    </div>
  );
}

const Field = forwardRef(FieldBase);
export default Field;

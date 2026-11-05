import { useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import IconButton from "@/components/ui/IconButton";
import styles from "./Modal.module.css";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Dialog with the behaviour hand-rolled modals usually miss:
 *   - focus moves into the dialog on open and returns to the trigger on close
 *   - Tab is trapped inside (otherwise keyboard users tab into the page behind)
 *   - Escape closes, background scroll is locked
 *   - rendered in a portal so parent overflow/transform can't clip it
 */
export default function Modal({ open, onClose, title, children, footer, size = "md" }) {
  const dialogRef = useRef(null);
  const previouslyFocused = useRef(null);

  const handleKeyDown = useCallback(
    (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose?.();
        return;
      }

      if (event.key !== "Tab") return;

      const focusable = dialogRef.current?.querySelectorAll(FOCUSABLE);
      if (!focusable?.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      // Wrap focus around the ends instead of letting it escape the dialog.
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (!open) return undefined;

    previouslyFocused.current = document.activeElement;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    // Focus the first control inside, falling back to the dialog itself.
    const focusable = dialogRef.current?.querySelectorAll(FOCUSABLE);
    (focusable?.[0] || dialogRef.current)?.focus();

    return () => {
      document.body.style.overflow = overflow;
      // Send focus back where it came from, so closing doesn't dump the
      // keyboard user at the top of the page.
      previouslyFocused.current?.focus?.();
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className={styles.overlay} onMouseDown={onClose} role="presentation">
      <div
        ref={dialogRef}
        className={[styles.dialog, styles[size]].join(" ")}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <header className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          <IconButton icon={X} label="Close" onClick={onClose} />
        </header>

        <div className={styles.body}>{children}</div>

        {footer && <footer className={styles.footer}>{footer}</footer>}
      </div>
    </div>,
    document.body
  );
}

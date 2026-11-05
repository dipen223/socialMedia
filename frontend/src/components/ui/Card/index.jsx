import styles from "./Card.module.css";

/** The standard surface: white panel, one border, one radius, one shadow. */
export default function Card({ as: Tag = "section", padded = true, className = "", children, ...rest }) {
  const classes = [styles.card, padded ? styles.padded : "", className].filter(Boolean).join(" ");
  return (
    <Tag className={classes} {...rest}>
      {children}
    </Tag>
  );
}

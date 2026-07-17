import styles from "./SectionPanel.module.css";

export default function SectionPanel({ eyebrow = "SocialHub", title, description, children }) {
  return (
    <section className={styles.panel}>
      <p className={styles.eyebrow}>{eyebrow}</p>
      <h1>{title}</h1>
      {description && <p className={styles.description}>{description}</p>}
      {children}
    </section>
  );
}

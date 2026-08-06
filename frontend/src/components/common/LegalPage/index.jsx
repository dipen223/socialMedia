import Head from "next/head";
import Link from "next/link";
import styles from "@/styles/legal.module.css";

export default function LegalPage({ title, description, children }) {
  const privacyEmail = process.env.NEXT_PUBLIC_PRIVACY_EMAIL;

  return (
    <>
      <Head>
        <title>{title} | SocialHub</title>
        <meta name="description" content={description} />
      </Head>

      <main className={styles.page}>
        <header className={styles.header}>
          <Link href="/" className={styles.brand}>
            <span>R</span>
            SocialHub
          </Link>
          <Link href="/" className={styles.backLink}>Back to SocialHub</Link>
        </header>

        <article className={styles.document}>
          <p className={styles.eyebrow}>SocialHub policies</p>
          <h1>{title}</h1>
          <p className={styles.updated}>Effective July 30, 2026</p>
          {children}

          <section>
            <h2>Contact</h2>
            {privacyEmail ? (
              <p>
                Questions or requests can be sent to{" "}
                <a href={`mailto:${privacyEmail}`}>{privacyEmail}</a>.
              </p>
            ) : (
              <p>
                The app operator must publish a monitored privacy contact before
                public launch.
              </p>
            )}
          </section>
        </article>

        <footer className={styles.footer}>
          <span>SocialHub</span>
          <nav aria-label="Legal pages">
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/data-deletion">Data deletion</Link>
          </nav>
        </footer>
      </main>
    </>
  );
}

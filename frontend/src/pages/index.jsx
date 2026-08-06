import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import styles from "@/styles/home.module.css";
import {useEffect} from "react";



export default function Home() {
   const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem("token");
    if(token){
      router.push("/dashboard");
    }

  }, [router])
 

  return (
    <main className={styles.page}>
      <nav className={styles.navbar} aria-label="Main navigation">
        <button className={styles.brand} onClick={() => router.push("/")}>
          <span className={styles.logoMark}>S</span>
          <span>SocialHub</span>
        </button>

        <div className={styles.navActions}>
          <button className={styles.loginButton} onClick={() => router.push("/login")}>
            Log in
          </button>
          <button className={styles.navJoinButton} onClick={() => router.push("/signup")}>
            Join now
          </button>
        </div>
      </nav>

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>
            <span /> A place to belong
          </p>
          <h1>
            Real people.
            <br />
            <em className={styles.connectionsLine}>
              <span className={styles.connectionsText}>Real connections.</span>
            </em>
          </h1>
          <p className={styles.heroText}>
            SocialHub brings your favorite people, conversations, and communities together in one
            welcoming space.
          </p>

          <div className={styles.heroActions}>
            <button className={styles.primaryButton} onClick={() => router.push("/signup")}>
              Create your account <span>→</span>
            </button>
            
          </div>

          <div className={styles.peopleRow}>
            <div className={styles.avatars} aria-hidden="true">
              <span>AM</span>
              <span>JK</span>
              <span>RS</span>
              <span>+</span>
            </div>
            <p>
              <strong>Join the conversation</strong>
              <br />
              Your community is waiting.
            </p>
          </div>
        </div>

        <div className={styles.illustrationWrap}>
          <div className={styles.illustrationGlow} aria-hidden="true" />
          <Image
            className={styles.heroIllustration}
            src="/images/socialhub-connections-hero.png"
            alt="People around the world connected through a social network"
            width={1774}
            height={887}
            sizes="(max-width: 900px) 92vw, 54vw"
            priority
          />
        </div>
      </section>

      <footer className={styles.footer}>
        <span>SocialHub</span>
        <nav aria-label="Legal pages">
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/data-deletion">Data deletion</Link>
        </nav>
      </footer>
    </main>
  );
}

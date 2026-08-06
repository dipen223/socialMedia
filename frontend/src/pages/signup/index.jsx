import { useState,useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useDispatch, useSelector } from "react-redux";
import { registerUser } from "@/config/redux/action/authAction";
import styles from "@/styles/auth.module.css";

export default function Signup() {
  const router = useRouter();
  const dispatch = useDispatch();

  useEffect(() => {
  const token = localStorage.getItem("token");

  if (token) {
    router.replace("/dashboard");
  }
}, [router]);


  const { isLoading, isError, message } = useSelector((state) => state.auth);
  const [form, setForm] = useState({ name: "", username: "", email: "", password: "" });

  const handleChange = (event) => {
    setForm({ ...form, [event.target.name]: event.target.value });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    try {
      await dispatch(registerUser(form)).unwrap();
      router.push("/dashboard");
    } catch {
     
    }
  };

  return (
    <main className={styles.page}>
      <Link href="/" className={styles.brand}>
        <span>S</span> SocialHub
      </Link>

      <section className={styles.card}>
        <div className={styles.heading}>
          <p>Join the community</p>
          <h1>Create your account</h1>
          <span>Meet new people and share what matters to you.</span>
        </div>

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.twoColumns}>
            <div>
              <label htmlFor="name">Full name</label>
              <input
                id="name"
                name="name"
                placeholder="Alex Morgan"
                value={form.name}
                onChange={handleChange}
                autoComplete="name"
                required
              />
            </div>

            <div>
              <label htmlFor="username">Username</label>
              <input
                id="username"
                name="username"
                placeholder="alexmorgan"
                value={form.username}
                onChange={handleChange}
                autoComplete="username"
                required
              />
            </div>
          </div>

          <label htmlFor="email">Email address</label>
          <input
            id="email"
            name="email"
            type="email"
            placeholder="you@example.com"
            value={form.email}
            onChange={handleChange}
            autoComplete="email"
            required
          />

          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            placeholder="Create a password"
            value={form.password}
            onChange={handleChange}
            autoComplete="new-password"
            minLength={6}
            required
          />

          {isError && <p className={styles.error}>{message}</p>}

          <button className={styles.submitButton} disabled={isLoading}>
            {isLoading ? "Creating account..." : "Create account"}
          </button>
        </form>

        <p className={styles.terms}>
          By creating an account, you agree to be respectful and help keep SocialHub welcoming.
        </p>

        <p className={styles.switchText}>
          Already have an account? <Link href="/login">Log in</Link>
        </p>
      </section>

      <p className={styles.footer}>Connect. Share. Grow together.</p>
    </main>
  );
}

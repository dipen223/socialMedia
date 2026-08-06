import { useState,useEffect} from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useDispatch, useSelector } from "react-redux";
import { loginUser } from "@/config/redux/action/authAction";
import styles from "@/styles/auth.module.css";

export default function Login() {
  const router = useRouter();
  const dispatch = useDispatch();

  useEffect(() => {
  const token = localStorage.getItem("token");

  if (token) {
    router.replace("/dashboard");
  }
}, [router]);


  const { isLoading, isError, message } = useSelector((state) => state.auth);
  const [form, setForm] = useState({ email: "", password: "" });

  const handleChange = (event) => {
    setForm({ ...form, [event.target.name]: event.target.value });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    try {
      await dispatch(loginUser(form)).unwrap();
      router.push("/dashboard");
    } catch {
      // Redux stores and displays the API error below the form.
    }
  };

  return (
    <main className={styles.page}>
      <Link href="/" className={styles.brand}>
        <span>S</span> SocialHub
      </Link>

      <section className={styles.card}>
        <div className={styles.heading}>
          <p>Welcome back</p>
          <h1>Log in to SocialHub</h1>
          <span>Continue connecting with the people who matter.</span>
        </div>

        <form className={styles.form} onSubmit={handleSubmit}>
          <label htmlFor="email">Email address</label>
          <input
            id="email"
            name="email"
            type="email"
            placeholder="you@provider.com"
            value={form.email}
            onChange={handleChange}
            autoComplete="email"
            required
          />

          <div className={styles.labelRow}>
            <label htmlFor="password">Password</label>
            <button type="button">Forgot password?</button>
          </div>
          <input
            id="password"
            name="password"
            type="password"
            placeholder="Enter your password"
            value={form.password}
            onChange={handleChange}
            autoComplete="current-password"
            required
          />

          {router.query.reason === "session-expired" && !isError && (
            <p className={styles.info}>
              Your session has expired. Please log in again.
            </p>
          )}

          {isError && <p className={styles.error}>{message}</p>}

          <button className={styles.submitButton} type="submit" disabled={isLoading}>
            {isLoading ? "Logging in..." : "Log in"}
          </button>
        </form>

        <p className={styles.switchText}>
          New to SocialHub? <Link href="/signup">Create an account</Link>
        </p>
      </section>

      <p className={styles.footer}>Connect. Share. Grow together.</p>
    </main>
  );
}

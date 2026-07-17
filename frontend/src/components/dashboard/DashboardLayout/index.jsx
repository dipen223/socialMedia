import Navbar from "@/components/dashboard/Navbar";
import Sidebar from "@/components/dashboard/Sidebar";
import useDashboardAuth from "@/hooks/useDashboardAuth";
import styles from "./DashboardLayout.module.css";

export default function DashboardLayout({ children }) {
  const checkingAuth = useDashboardAuth();

  if (checkingAuth) {
    return <div className={styles.checking}>Checking authentication...</div>;
  }

  return (
    <>
      <Navbar />
      <main className={styles.layout}>
        <Sidebar />
        <div className={styles.centerColumn}>{children}</div>
      </main>
    </>
  );
}

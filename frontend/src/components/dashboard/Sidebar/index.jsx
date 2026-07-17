import Link from "next/link";
import { useRouter } from "next/router";
import styles from "./Sidebar.module.css";


const sidebarOptions = [
  { href: "/dashboard", label: "Home" },
  { href: "/dashboard/profile", label: "My Profile" },
  { href: "/dashboard/connections", label: "Connections" },
  { href: "/dashboard/messages", label: "Messages" },
  { href: "/dashboard/discover", label: "Discover People" },
  { href: "/dashboard/settings", label: "Settings" },
];


const Sidebar = () => {
  const router = useRouter();

  return (
    <aside className={styles.aside}>
      <nav aria-label="Dashboard navigation" className={styles.sidebarNav}>
        {sidebarOptions.map((option) => (
          <Link
            href={option.href}
            key={option.href}
            className={router.pathname === option.href ? styles.active : ""}
            aria-current={router.pathname === option.href ? "page" : undefined}
          >
            {option.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
};

export default Sidebar;

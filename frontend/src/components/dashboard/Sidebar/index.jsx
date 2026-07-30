import Link from "next/link";
import { useRouter } from "next/router";
import { useSelector } from "react-redux";
import styles from "./Sidebar.module.css";


const Sidebar = () => {
  const router = useRouter();
  const profile = useSelector((state) => state.auth.user);
  const user = profile?.userId || profile;
  const sidebarOptions = [
    { href: "/dashboard", label: "Home" },
    { href: user?.username ? `/${user.username}` : "/dashboard/profile", label: "My Profile", profile: true },
    { href: "/dashboard/connections", label: "Connections" },
    { href: "/dashboard/saved", label: "Saved Bookmarks" },
    { href: "/dashboard/messages", label: "Messages" },
    { href: "/dashboard/discover", label: "Discover People" },
    { href: "/dashboard/settings", label: "Settings" },
  ];

  return (
    <aside className={styles.aside}>
      <nav aria-label="Dashboard navigation" className={styles.sidebarNav}>
        {sidebarOptions.map((option) => {
          const isActive = option.profile
            ? router.pathname === "/dashboard/profile" ||
              (router.pathname === "/[username]" &&
                router.query.username?.toLowerCase() ===
                  user?.username?.toLowerCase())
            : router.pathname === option.href;

          return (
            <Link
              href={option.href}
              key={option.href}
              className={isActive ? styles.active : ""}
              aria-current={isActive ? "page" : undefined}
            >
              {option.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
};

export default Sidebar;

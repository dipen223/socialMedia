import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { logout } from "@/config/redux/reducer/authReducer";
import styles from "./Navbar.module.css";
import { clientServer } from "@/config";

const SearchIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="m21 21-4.35-4.35m2.35-5.4A7.75 7.75 0 1 1 3.5 11.25a7.75 7.75 0 0 1 15.5 0Z" />
  </svg>
);

const HomeIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V10Z" />
  </svg>
);

const NetworkIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m7-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.87m-3-11.96a4 4 0 0 1 0 7.75" />
  </svg>
);

export default function Navbar() {
  const router = useRouter();
  const dispatch = useDispatch();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState("");

  const menuRef = useRef(null);
  const profile = useSelector((state) => state.auth.user);
  const user = profile?.userId || profile;


  const initials = user?.name
    ?.split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "R";
  const hasProfilePicture =
    user?.profilePicture && user.profilePicture !== "default.jpg";

  useEffect(() => {
    const closeMenu = (event) => {
      if (event.key === "Escape") {
        setIsMenuOpen(false);
      }

      if (event.type === "mousedown" && !menuRef.current?.contains(event.target)) {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", closeMenu);
    document.addEventListener("keydown", closeMenu);

    return () => {
      document.removeEventListener("mousedown", closeMenu);
      document.removeEventListener("keydown", closeMenu);
    };
  }, []);

  //people search

  useEffect(() => {
    const query = searchQuery.trim();

    if (query.length < 2) {
      return;
    }

    const controller = new AbortController();

    const timeoutId = setTimeout(async () => {
      setIsSearching(true);
      setSearchError("");

      try {
        const response = await clientServer.get("/search/people", {
          params: { q: query },
          signal: controller.signal,
        });

        setSearchResults(Array.isArray(response.data.people) ? response.data.people : []);
      } catch (err) {
        if (err.code !== "ERR_CANCELED") {
          setSearchError(
            err.response?.data?.message ||
            "Could not search for people."
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsSearching(false);
        }
      }
    }, 300);

    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [searchQuery]);



  const handleLogout = () => {
    setIsMenuOpen(false);
    dispatch(logout());
    router.replace("/login");
  };

  const handleSearch = (event) => {
    event.preventDefault();
  };

  const handleSearchQueryChange = (event) => {
    const value = event.target.value;
    setSearchQuery(value);

    if (value.trim().length < 2) {
      setSearchResults([]);
      setSearchError("");
      setIsSearching(false);
    }
  };

  return (
    <header className={styles.header}>
      <nav className={styles.nav} aria-label="Main navigation">
        <Link href="/dashboard" className={styles.brand} aria-label="Ripple home">
          <span className={styles.brandMark}>S</span>
          <span className={styles.brandName}>Ripple</span>
        </Link>

        <form className={styles.search} role="search" onSubmit={handleSearch}>
          <SearchIcon />
          <label className={styles.srOnly} htmlFor="dashboard-search">
            Search Ripple
          </label>
          <input
            id="dashboard-search"
            type="search"
            placeholder="Search people, posts..."
            value={searchQuery}
            onChange={handleSearchQueryChange}
          />
          {searchQuery.trim().length >= 2 && (
            <div className={styles.searchDropdown}>
              {isSearching && <p className={styles.searchStatus}>Searching...</p>}
              {!isSearching && searchResults.map((person) => {
                const hasPicture =
                  person.profilePicture &&
                  person.profilePicture !== "default.jpg";
                const personInitials = person.name
                  ?.split(" ")
                  .map((part) => part[0])
                  .slice(0, 2)
                  .join("")
                  .toUpperCase() || "R";

                return (
                  <Link
                    key={person._id}
                    className={styles.searchResult}
                    href={`/${person.username}`}
                    onClick={() => {
                      setSearchQuery("");
                      setSearchResults([]);
                    }}
                  >
                    <span className={styles.searchAvatar}>
                      {hasPicture ? (
                        <img src={person.profilePicture} alt="" />
                      ) : (
                        personInitials
                      )}
                    </span>
                    <span className={styles.searchIdentity}>
                      <strong>{person.name}</strong>
                      <small>@{person.username}</small>
                    </span>
                  </Link>
                );
              })}

              {!isSearching && !searchError && searchResults.length === 0 && (
                <p className={styles.searchStatus}>No people found.</p>
              )}

              {searchError && <p
                className={`${styles.searchStatus} ${styles.searchError}`}
                role="alert"
              >
                {searchError}
              </p>}


            </div>
          )}
          <kbd>/</kbd>
        </form>

        <div className={styles.actions}>
          <Link
            href="/dashboard"
            className={`${styles.navLink} ${router.pathname === "/dashboard" ? styles.active : ""}`}
          >
            <HomeIcon />
            <span>Home</span>
          </Link>

          <Link
            href="/dashboard/connections"
            className={`${styles.navLink} ${router.pathname === "/dashboard/connections" ? styles.active : ""}`}
          >
            <NetworkIcon />
            <span>Network</span>
          </Link>

          <span className={styles.divider} aria-hidden="true" />

          <div className={styles.profileMenu} ref={menuRef}>
            <button
              className={styles.profileTrigger}
              type="button"
              aria-haspopup="menu"
              aria-expanded={isMenuOpen}
              onClick={() => setIsMenuOpen((open) => !open)}
            >
              <span className={styles.avatar}>
                {hasProfilePicture ? <img src={user.profilePicture} alt="" /> : initials}
              </span>
              <span className={styles.userText}>
                <strong>{user?.name || "Your profile"}</strong>
                <small>@{user?.username || "member"}</small>
              </span>
              <span className={styles.chevron} aria-hidden="true">⌄</span>
            </button>

            {isMenuOpen && (
              <div className={styles.dropdown} role="menu">
                <div className={styles.dropdownIdentity}>
                  <strong>{user?.name || "Your profile"}</strong>
                  <span>@{user?.username || "member"}</span>
                </div>
                <Link href={user?.username ? `/${user.username}` : "/dashboard/profile"} role="menuitem" onClick={() => setIsMenuOpen(false)}>
                  View profile
                </Link>
                <span className={styles.dropdownDivider} aria-hidden="true" />
                <button type="button" role="menuitem" onClick={handleLogout}>
                  Log out
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>
    </header>
  );
}

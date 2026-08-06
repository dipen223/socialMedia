import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { logout } from "@/config/redux/reducer/authReducer";
import styles from "./Navbar.module.css";
import { clientServer } from "@/config";
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/config/redux/action/notificationAction";
import {
  acceptConnectionRequest,
  deleteConnectionRequest,
  getMyConnections,
} from "@/config/redux/action/connectionAction";

import { getSocket } from "@/config/socket";

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

const CompassIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.8" fill="none" />
    <polygon points="16.24,7.76 14.12,14.12 7.76,16.24 9.88,9.88" stroke="currentColor" strokeWidth="1.8" fill="none" />
  </svg>
);

const BellIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4" />
  </svg>
);

const ClockIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

const CloseIcon = () => (
  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const BookmarkNavIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
  </svg>
);

const formatNotificationTime = (date) => {
  const elapsed = Date.now() - new Date(date).getTime();
  const minutes = Math.max(1, Math.floor(elapsed / 60000));

  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
};

export default function Navbar() {
  const router = useRouter();
  const dispatch = useDispatch();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searchHistory, setSearchHistory] = useState(() => {
    if (typeof window === "undefined") return [];
    try {
      const saved = localStorage.getItem("ripple_search_history");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  const menuRef = useRef(null);
  const notificationRef = useRef(null);
  const searchContainerRef = useRef(null);
  const profile = useSelector((state) => state.auth.user);

  const saveProfileToHistory = (person) => {
    if (!person) return;
    const isObj = typeof person === "object" && person.username;

    setSearchHistory((prev) => {
      const filtered = prev.filter((item) => {
        if (isObj && typeof item === "object") {
          return item.username?.toLowerCase() !== person.username.toLowerCase();
        }
        if (isObj && typeof item === "string") {
          return item.toLowerCase() !== person.username.toLowerCase() && item.toLowerCase() !== person.name?.toLowerCase();
        }
        if (!isObj && typeof item === "object") {
          return item.username?.toLowerCase() !== person.toLowerCase() && item.name?.toLowerCase() !== person.toLowerCase();
        }
        return item.toLowerCase() !== person.toLowerCase();
      });

      const entry = isObj
        ? {
            _id: person._id,
            name: person.name,
            username: person.username,
            profilePicture: person.profilePicture || "default.jpg",
          }
        : person.trim();

      const updated = [entry, ...filtered].slice(0, 5);
      try {
        localStorage.setItem("ripple_search_history", JSON.stringify(updated));
      } catch {
        // Ignore storage errors
      }
      return updated;
    });
  };

  const removeFromHistory = (itemToRemove, e) => {
    e.stopPropagation();
    setSearchHistory((prev) => {
      const updated = prev.filter((item) => {
        if (typeof item === "object" && typeof itemToRemove === "object") {
          return item.username !== itemToRemove.username;
        }
        if (typeof item === "object") {
          return item.username !== itemToRemove && item.name !== itemToRemove;
        }
        if (typeof itemToRemove === "object") {
          return item !== itemToRemove.username && item !== itemToRemove.name;
        }
        return item !== itemToRemove;
      });
      try {
        localStorage.setItem("ripple_search_history", JSON.stringify(updated));
      } catch {
        // Ignore storage errors
      }
      return updated;
    });
  };

  const clearHistory = (e) => {
    e.stopPropagation();
    setSearchHistory([]);
    try {
      localStorage.removeItem("ripple_search_history");
    } catch {
      // Ignore storage errors
    }
  };

  const {
    notifications,
    unreadCount,
    isLoading: notificationsLoading,
    isUpdating: notificationsUpdating,
    error: notificationsError,
  } = useSelector((state) => state.notifications);
  const { acceptingRequestId, deletingRequestId } = useSelector(
    (state) => state.connections
  );
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
        setIsNotificationsOpen(false);
        setIsSearchFocused(false);
      }

      if (event.type === "mousedown") {
        if (!menuRef.current?.contains(event.target)) {
          setIsMenuOpen(false);
        }
        if (!notificationRef.current?.contains(event.target)) {
          setIsNotificationsOpen(false);
        }
        if (!searchContainerRef.current?.contains(event.target)) {
          setIsSearchFocused(false);
        }
      }
    };

    document.addEventListener("mousedown", closeMenu);
    document.addEventListener("keydown", closeMenu);

    return () => {
      document.removeEventListener("mousedown", closeMenu);
      document.removeEventListener("keydown", closeMenu);
    };
  }, []);

  // Fetch notifications on mount and listen to real-time socket updates
  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) return;

    dispatch(getNotifications());

    const socket = getSocket();
    if (socket) {
      if (!socket.connected) {
        socket.connect();
      }

      const handleLiveNotification = () => {
        dispatch(getNotifications());
      };

      socket.on("new_notification", handleLiveNotification);
      socket.on("notification", handleLiveNotification);

      return () => {
        socket.off("new_notification", handleLiveNotification);
        socket.off("notification", handleLiveNotification);
      };
    }
  }, [dispatch]);

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
    if (searchQuery.trim()) {
      saveSearchToHistory(searchQuery);
      setIsSearchFocused(false);
      router.push(`/dashboard/explore?q=${encodeURIComponent(searchQuery.trim())}`);
    }
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

  const openNotification = (notification) => {
    if (!notification.readAt) {
      dispatch(markNotificationRead(notification._id));
    }

    setIsNotificationsOpen(false);
    if (
      ["new_message", "missed_call"].includes(notification.type) &&
      notification.conversationId
    ) {
      router.push(
        `/dashboard/messages?conversation=${notification.conversationId}`
      );
      return;
    }
    if (
      ["post_liked", "post_face_reacted", "post_commented"].includes(notification.type) &&
      notification.postId
    ) {
      router.push(`/dashboard/posts/${notification.postId}`);
      return;
    }

    const username = notification.actorId?.username;
    router.push(username ? `/${username}` : "/dashboard/connections");
  };

  const handleRequestAction = async (notification, action) => {
    if (!notification.connectionId) return;

    try {
      if (action === "accept") {
        await dispatch(
          acceptConnectionRequest(notification.connectionId)
        ).unwrap();
        await dispatch(getMyConnections());
      } else {
        await dispatch(
          deleteConnectionRequest(notification.connectionId)
        ).unwrap();
      }

      await dispatch(getNotifications());
    } catch {
      // Redux exposes the request error in the connection state.
    }
  };

  return (
    <header className={styles.header}>
      <nav className={styles.nav} aria-label="Main navigation">
        <Link href="/dashboard" className={styles.brand} aria-label="SocialHub home">
          <span className={styles.brandMark}>S</span>
          <span className={styles.brandName}>SocialHub</span>
        </Link>

        <form className={styles.search} role="search" onSubmit={handleSearch} ref={searchContainerRef}>
          <SearchIcon />
          <label className={styles.srOnly} htmlFor="dashboard-search">
            Search SocialHub
          </label>
          <input
            id="dashboard-search"
            type="search"
            placeholder="Search people, posts..."
            value={searchQuery}
            onFocus={() => setIsSearchFocused(true)}
            onChange={handleSearchQueryChange}
          />
          {/* Recent Searches Dropdown */}
          {isSearchFocused && searchQuery.trim().length < 2 && searchHistory.length > 0 && (
            <div className={styles.searchDropdown}>
              <div className={styles.recentHeader}>
                <strong>Recent Searches</strong>
                <button type="button" className={styles.clearHistoryBtn} onClick={clearHistory}>
                  Clear all
                </button>
              </div>
              {searchHistory.map((item, idx) => {
                const isProfile = typeof item === "object" && item.username;
                if (isProfile) {
                  const hasPicture = item.profilePicture && item.profilePicture !== "default.jpg";
                  const personInitials = item.name
                    ?.split(" ")
                    .map((part) => part[0])
                    .slice(0, 2)
                    .join("")
                    .toUpperCase() || "R";

                  return (
                    <div
                      key={item._id || item.username || idx}
                      className={styles.searchResult}
                      onClick={() => {
                        setIsSearchFocused(false);
                        setSearchQuery("");
                        router.push(`/${item.username}`);
                      }}
                    >
                      <span className={styles.searchAvatar}>
                        {hasPicture ? (
                          <img src={item.profilePicture} alt="" />
                        ) : (
                          personInitials
                        )}
                      </span>
                      <span className={styles.searchIdentity}>
                        <strong>{item.name}</strong>
                        <small>@{item.username}</small>
                      </span>
                      <button
                        type="button"
                        className={styles.removeHistoryBtn}
                        onClick={(e) => removeFromHistory(item, e)}
                        aria-label={`Remove ${item.name}`}
                      >
                        <CloseIcon />
                      </button>
                    </div>
                  );
                }

                return (
                  <div
                    key={item || idx}
                    className={styles.recentItem}
                    onClick={() => {
                      setSearchQuery(item);
                    }}
                  >
                    <span className={styles.recentIcon}><ClockIcon /></span>
                    <span className={styles.recentText}>{item}</span>
                    <button
                      type="button"
                      className={styles.removeHistoryBtn}
                      onClick={(e) => removeFromHistory(item, e)}
                      aria-label={`Remove ${item}`}
                    >
                      <CloseIcon />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

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
                      saveProfileToHistory(person);
                      setSearchQuery("");
                      setSearchResults([]);
                      setIsSearchFocused(false);
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
            href="/dashboard/explore"
            className={`${styles.navLink} ${router.pathname === "/dashboard/explore" ? styles.active : ""}`}
          >
            <CompassIcon />
            <span>Explore</span>
          </Link>

          <Link
            href="/dashboard/connections"
            className={`${styles.navLink} ${router.pathname === "/dashboard/connections" ? styles.active : ""}`}
          >
            <NetworkIcon />
            <span>Network</span>
          </Link>

          <Link
            href="/dashboard/saved"
            className={`${styles.navLink} ${router.pathname === "/dashboard/saved" ? styles.active : ""}`}
          >
            <BookmarkNavIcon />
            <span>Saved</span>
          </Link>

          <div className={styles.notificationMenu} ref={notificationRef}>
            <button
              className={styles.notificationTrigger}
              type="button"
              aria-label={
                unreadCount
                  ? `Notifications, ${unreadCount} unread`
                  : "Notifications"
              }
              aria-haspopup="dialog"
              aria-expanded={isNotificationsOpen}
              onClick={() => {
                if (!isNotificationsOpen) {
                  dispatch(getNotifications());
                }
                setIsNotificationsOpen((open) => !open);
                setIsMenuOpen(false);
              }}
            >
              <BellIcon />
              {unreadCount > 0 && (
                <span className={styles.notificationBadge}>
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>

            {isNotificationsOpen && (
              <div
                className={styles.notificationDropdown}
                role="dialog"
                aria-label="Notifications"
              >
                <header className={styles.notificationHeader}>
                  <div>
                    <strong>Notifications</strong>
                    <span>{unreadCount} unread</span>
                  </div>
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      disabled={notificationsUpdating}
                      onClick={() => dispatch(markAllNotificationsRead())}
                    >
                      {notificationsUpdating ? "Updating..." : "Mark all read"}
                    </button>
                  )}
                </header>

                <div className={styles.notificationList}>
                  {notificationsLoading && notifications.length === 0 && (
                    <p className={styles.notificationStatus}>
                      Loading notifications...
                    </p>
                  )}

                  {!notificationsLoading && notifications.length === 0 && (
                    <div className={styles.notificationEmpty}>
                      <BellIcon />
                      <strong>You&apos;re all caught up</strong>
                      <span>New activity will appear here.</span>
                    </div>
                  )}

                  {notifications.map((notification) => {
                    const actor = notification.actorId;
                    const hasPicture =
                      actor?.profilePicture &&
                      actor.profilePicture !== "default.jpg";
                    const actorInitials =
                      actor?.name
                        ?.split(" ")
                        .map((part) => part[0])
                        .slice(0, 2)
                        .join("")
                        .toUpperCase() || "R";
                    const isRequest =
                      notification.type === "connection_request";
                    const notificationMessage = {
                      connection_request: "sent you a connection request.",
                      connection_accepted: "accepted your connection request.",
                      post_liked: "liked your post.",
                      post_face_reacted: `reacted with “${notification.faceReactionId?.name || "a FaceMoji"}”.`,
                      post_commented: "commented on your post.",
                      new_message: "sent you a message.",
                      missed_call: "tried to call you.",
                    }[notification.type] || "interacted with you.";
                    const isAccepting =
                      acceptingRequestId === notification.connectionId;
                    const isDeleting =
                      deletingRequestId === notification.connectionId;

                    return (
                      <article
                        className={`${styles.notificationItem} ${
                          !notification.readAt ? styles.unread : ""
                        }`}
                        key={notification._id}
                      >
                        <button
                          className={styles.notificationContent}
                          type="button"
                          onClick={() => openNotification(notification)}
                        >
                          <span className={styles.notificationAvatar}>
                            {hasPicture ? (
                              <img src={actor.profilePicture} alt="" />
                            ) : (
                              actorInitials
                            )}
                          </span>
                          {notification.type === "post_face_reacted" && notification.faceReactionId?.imageUrl && (
                            <img className={styles.notificationReaction} src={notification.faceReactionId.imageUrl} alt={notification.faceReactionId.name || "FaceMoji"} />
                          )}
                          <span className={styles.notificationCopy}>
                            <span>
                              <strong>{actor?.name || "Someone"}</strong>{" "}
                              {notificationMessage}
                            </span>
                            <small>
                              {formatNotificationTime(notification.createdAt)}
                            </small>
                          </span>
                        </button>

                        {isRequest && (
                          <div className={styles.notificationActions}>
                            <button
                              type="button"
                              disabled={isAccepting || isDeleting}
                              onClick={() =>
                                handleRequestAction(notification, "accept")
                              }
                            >
                              {isAccepting ? "Confirming..." : "Confirm"}
                            </button>
                            <button
                              type="button"
                              disabled={isAccepting || isDeleting}
                              onClick={() =>
                                handleRequestAction(notification, "delete")
                              }
                            >
                              {isDeleting ? "Deleting..." : "Delete"}
                            </button>
                          </div>
                        )}
                      </article>
                    );
                  })}

                  {notificationsError && (
                    <p
                      className={`${styles.notificationStatus} ${styles.notificationError}`}
                      role="alert"
                    >
                      {notificationsError}
                    </p>
                  )}
                </div>

                <Link
                  className={styles.viewConnections}
                  href="/dashboard/connections"
                  onClick={() => setIsNotificationsOpen(false)}
                >
                  View connections
                </Link>
              </div>
            )}
          </div>

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

import Link from "next/link";
import styles from "./Avatar.module.css";

// "default.jpg" is what the backend stores when someone has no picture - it
// isn't a real image, so it has to fall through to initials.
const hasRealPicture = (user) =>
  Boolean(user?.profilePicture && user.profilePicture !== "default.jpg");

export const initialsFor = (name = "") =>
  name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "R";

/**
 * Avatar with the initials fallback every screen was reimplementing.
 * Pass `href` (or a user with a username) to make it a link to the profile.
 */
export default function Avatar({ user, size = "md", href, className = "", ...rest }) {
  const classes = [styles.avatar, styles[size], className].filter(Boolean).join(" ");

  const content = hasRealPicture(user) ? (
    // alt="" - the avatar always sits next to the person's name, so
    // announcing it again is just noise for a screen reader.
    <img src={user.profilePicture} alt="" className={styles.image} />
  ) : (
    <span aria-hidden="true">{initialsFor(user?.name)}</span>
  );

  const target = href ?? (user?.username ? `/${user.username}` : null);

  if (target) {
    return (
      <Link href={target} className={classes} aria-label={`View ${user?.name || "profile"}`} {...rest}>
        {content}
      </Link>
    );
  }

  return (
    <span className={classes} {...rest}>
      {content}
    </span>
  );
}

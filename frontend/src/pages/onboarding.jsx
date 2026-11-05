import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { useDispatch, useSelector } from "react-redux";
import useDashboardAuth from "@/hooks/useDashboardAuth";
import ConnectButton from "@/components/dashboard/ConnectionButton";
import { clientServer } from "@/config";
import { LANGUAGES } from "@/config/languages";
import { guessLanguage, pickSuggestions } from "@/config/onboarding";
import { getUserProfile } from "@/config/redux/action/authAction";
import { getAllProfiles } from "@/config/redux/action/profileAction";
import {
  getSentRequests,
  getReceivedRequests,
  getMyConnections,
} from "@/config/redux/action/connectionAction";
import styles from "@/styles/onboarding.module.css";

const STEPS = ["Language", "People", "Done"];

export default function OnboardingPage() {
  const router = useRouter();
  const dispatch = useDispatch();
  const checkingAuth = useDashboardAuth();

  const authState = useSelector((state) => state.auth.user);
  const currentUser = authState?.userId || authState;
  const { profiles, isLoading: loadingProfiles, isError: profilesError, hasFetched } =
    useSelector((state) => state.profiles);
  const connections = useSelector((state) => state.connections);

  const [step, setStep] = useState(0);
  const [language, setLanguage] = useState(null);
  const [voice, setVoice] = useState("female");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Start from the browser's own language so most people just press Continue.
  const suggestedLanguage = useMemo(
    () =>
      typeof navigator === "undefined"
        ? "en-US"
        : guessLanguage(
            navigator.languages?.length ? navigator.languages : [navigator.language],
            Object.keys(LANGUAGES)
          ),
    []
  );
  const selectedLanguage = language || suggestedLanguage;

  // The people step needs the profile list and everyone's connection state
  // (the Connect button reads it to know what to show).
  useEffect(() => {
    if (checkingAuth) return;
    if (!hasFetched && !loadingProfiles && !profilesError) dispatch(getAllProfiles());
    if (!connections.hasFetchedSent && !connections.isLoadingSent) dispatch(getSentRequests());
    if (!connections.hasFetchedReceived && !connections.isLoadingReceived) dispatch(getReceivedRequests());
    if (!connections.hasFetchedConnections && !connections.isLoadingConnections) dispatch(getMyConnections());
  }, [checkingAuth, connections, dispatch, hasFetched, loadingProfiles, profilesError]);

  const suggestions = useMemo(
    () => pickSuggestions(profiles, currentUser?._id, 6),
    [profiles, currentUser?._id]
  );

  const saveLanguage = async () => {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      await clientServer.post("/updateAccountInfo", {
        preferredLanguage: selectedLanguage,
        voiceGender: voice,
      });
      dispatch(getUserProfile());
      setStep(1);
    } catch (err) {
      setError(err.response?.data?.message || "Could not save that. Try again, or skip for now.");
    } finally {
      setSaving(false);
    }
  };

  const finish = () => router.push("/dashboard");

  if (checkingAuth) {
    return (
      <div className={styles.loading} role="status" aria-label="Loading">
        <span className={styles.spinner} />
      </div>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <ol className={styles.progress} aria-label="Progress">
          {STEPS.map((label, index) => (
            <li
              key={label}
              className={index === step ? styles.progressActive : index < step ? styles.progressDone : ""}
              aria-current={index === step ? "step" : undefined}
            >
              {label}
            </li>
          ))}
        </ol>

        {step === 0 && (
          <section>
            <h1>Welcome{currentUser?.name ? `, ${currentUser.name.split(" ")[0]}` : ""}</h1>
            <p className={styles.lead}>
              Pick the language you want to read and hear. Everything other
              people write or say gets translated into it.
            </p>

            <div className={styles.languageGrid} role="radiogroup" aria-label="Your language">
              {Object.entries(LANGUAGES).map(([code, item]) => (
                <button
                  key={code}
                  type="button"
                  role="radio"
                  aria-checked={code === selectedLanguage}
                  className={code === selectedLanguage ? styles.languageActive : styles.language}
                  onClick={() => setLanguage(code)}
                >
                  <span aria-hidden="true">{item.flag}</span>
                  {item.name}
                </button>
              ))}
            </div>

            <h2>Your voice on calls</h2>
            <p className={styles.hint}>When your speech is translated for someone, this is the voice they hear.</p>
            <div className={styles.voiceRow}>
              {["female", "male"].map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={voice === value}
                  className={voice === value ? styles.languageActive : styles.language}
                  onClick={() => setVoice(value)}
                >
                  {value === "female" ? "Female" : "Male"}
                </button>
              ))}
            </div>

            {error && <p className={styles.error} role="alert">{error}</p>}

            <div className={styles.actions}>
              <button type="button" className={styles.skip} onClick={() => setStep(1)}>Skip for now</button>
              <button type="button" className={styles.primary} onClick={saveLanguage} disabled={saving}>
                {saving ? "Saving..." : "Continue"}
              </button>
            </div>
          </section>
        )}

        {step === 1 && (
          <section>
            <h1>Find people</h1>
            <p className={styles.lead}>
              Connect with a few people so your feed has something in it.
              You can always find more later.
            </p>

            {loadingProfiles && <p className={styles.hint} role="status">Loading people...</p>}
            {!loadingProfiles && suggestions.length === 0 && (
              <p className={styles.hint}>No one to suggest yet. You&apos;re one of the first here!</p>
            )}

            <ul className={styles.people}>
              {suggestions.map((profile) => {
                const user = profile.userId;
                const hasPicture = user.profilePicture && user.profilePicture !== "default.jpg";
                const initials =
                  user.name?.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase() || "S";
                return (
                  <li key={profile._id} className={styles.person}>
                    <span className={styles.avatar}>
                      {hasPicture ? <img src={user.profilePicture} alt="" /> : initials}
                    </span>
                    <span className={styles.personText}>
                      <strong>{user.name}</strong>
                      <small>@{user.username}</small>
                    </span>
                    <ConnectButton userId={user._id} />
                  </li>
                );
              })}
            </ul>

            <div className={styles.actions}>
              <button type="button" className={styles.skip} onClick={() => setStep(0)}>Back</button>
              <button type="button" className={styles.primary} onClick={() => setStep(2)}>Continue</button>
            </div>
          </section>
        )}

        {step === 2 && (
          <section className={styles.done}>
            <h1>You&apos;re all set</h1>
            <p className={styles.lead}>
              Post something, start a call, or open Notes. You can change your
              language and voice any time in Settings.
            </p>
            <div className={styles.actions}>
              <button type="button" className={styles.primary} onClick={finish}>Go to your feed</button>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

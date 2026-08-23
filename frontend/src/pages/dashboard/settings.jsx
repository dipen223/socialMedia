import { useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import SectionPanel from "@/components/dashboard/SectionPanel";
import { clientServer } from "@/config";
import { getUserProfile } from "@/config/redux/action/authAction";
import { LANGUAGES } from "@/config/languages";
import styles from "@/styles/settings.module.css";

export default function SettingsPage() {
  const dispatch = useDispatch();
  const authState = useSelector((state) => state.auth.user);
  const currentUser = authState?.userId || authState;
  const currentLanguage = currentUser?.preferredLanguage || "en-US";
  const currentVoiceGender = currentUser?.voiceGender === "male" ? "male" : "female";

  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(null);
  const [savingVoice, setSavingVoice] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const filteredLanguages = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return Object.entries(LANGUAGES);
    return Object.entries(LANGUAGES).filter(
      ([code, language]) =>
        language.name.toLowerCase().includes(q) || code.toLowerCase().includes(q)
    );
  }, [query]);

  const selectLanguage = async (code) => {
    if (code === currentLanguage || saving) return;
    setSaving(code);
    setErrorMsg("");
    try {
      await clientServer.post("/updateAccountInfo", { preferredLanguage: code });
      dispatch(getUserProfile());
    } catch (err) {
      setErrorMsg(
        err.response?.data?.message || "Could not save your language preference."
      );
    } finally {
      setSaving(null);
    }
  };

  const selectVoiceGender = async (gender) => {
    if (gender === currentVoiceGender || savingVoice) return;
    setSavingVoice(true);
    setErrorMsg("");
    try {
      await clientServer.post("/updateAccountInfo", { voiceGender: gender });
      dispatch(getUserProfile());
    } catch (err) {
      setErrorMsg(
        err.response?.data?.message || "Could not save your voice preference."
      );
    } finally {
      setSavingVoice(false);
    }
  };

  return (
    <DashboardLayout>
      <SectionPanel
        title="Settings"
        description="Your account and privacy controls will appear here."
      >
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h3>Translation language</h3>
            <p>
              When someone calls you, whatever they say is automatically
              translated into this language — you never need to tell them
              what language you speak.
            </p>
          </div>

          {errorMsg && <div className={styles.errorNotice}>{errorMsg}</div>}

          <input
            type="text"
            className={styles.search}
            placeholder="Search languages"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />

          <div className={styles.languageGrid}>
            {filteredLanguages.length === 0 && (
              <p className={styles.empty}>No languages match &ldquo;{query}&rdquo;.</p>
            )}
            {filteredLanguages.map(([code, language]) => {
              const isActive = code === currentLanguage;
              return (
                <button
                  key={code}
                  type="button"
                  className={`${styles.languageOption} ${
                    isActive ? styles.languageOptionActive : ""
                  }`}
                  onClick={() => selectLanguage(code)}
                  disabled={Boolean(saving)}
                  aria-pressed={isActive}
                >
                  <span className={styles.languageFlag}>{language.flag}</span>
                  <span className={styles.languageName}>{language.name}</span>
                  {isActive && <span className={styles.checkMark}>✓</span>}
                  {saving === code && (
                    <span className={styles.savingMark}>Saving…</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h3>Translated voice</h3>
            <p>
              When your speech gets translated for someone on a call, this is
              the voice they hear standing in for yours.
            </p>
          </div>

          <div className={styles.languageGrid}>
            {[
              { value: "female", label: "Female" },
              { value: "male", label: "Male" },
            ].map(({ value, label }) => {
              const isActive = value === currentVoiceGender;
              return (
                <button
                  key={value}
                  type="button"
                  className={`${styles.languageOption} ${
                    isActive ? styles.languageOptionActive : ""
                  }`}
                  onClick={() => selectVoiceGender(value)}
                  disabled={savingVoice}
                  aria-pressed={isActive}
                >
                  <span className={styles.languageName}>{label}</span>
                  {isActive && <span className={styles.checkMark}>✓</span>}
                </button>
              );
            })}
          </div>
        </div>
      </SectionPanel>
    </DashboardLayout>
  );
}

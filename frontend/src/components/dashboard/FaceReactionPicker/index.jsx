import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { clientServer } from "@/config";
import styles from "./FaceReactionPicker.module.css";

const TrashIcon = () => (
  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9 14.4 18m-4.8 0L9.26 9m9.97-3.21c.34.05.68.11 1.02.17m-1.02-.17-1.07 13.88a2.25 2.25 0 0 1-2.24 2.08H8.08a2.25 2.25 0 0 1-2.24-2.08L4.77 5.79m14.46 0a48.1 48.1 0 0 0-3.48-.4m-12 .57c.34-.06.68-.12 1.02-.17m0 0a48.1 48.1 0 0 1 3.48-.4m7.5 0v-.91c0-1.18-.91-2.17-2.09-2.2a51.96 51.96 0 0 0-3.32 0c-1.18.03-2.09 1.02-2.09 2.2v.91m7.5 0a48.67 48.67 0 0 0-7.5 0" />
  </svg>
);

export default function FaceReactionPicker({ postId, currentReaction, reactionCount = 0, onChange }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [library, setLibrary] = useState([]);
  const [capturedFile, setCapturedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reactionToDelete, setReactionToDelete] = useState(null);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraReady(false);
  };

  const clearCapture = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl("");
    setCapturedFile(null);
  };

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const loadLibrary = async () => {
    try {
      const { data } = await clientServer.get("/face-reactions");
      setLibrary(data.reactions || []);
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Could not load your FaceMojis.");
    }
  };

  const openPicker = () => {
    setOpen(true);
    setError("");
    loadLibrary();
  };

  const closePicker = () => {
    stopCamera();
    clearCapture();
    setCreating(false);
    setReactionToDelete(null);
    setOpen(false);
    setError("");
  };

  const startCamera = async () => {
    clearCapture();
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 720 } },
        audio: false
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraReady(true);
    } catch {
      setError("Camera access was blocked. You can upload a photo instead.");
    }
  };

  const selectFile = (file) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Choose an image file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Choose an image smaller than 5 MB.");
      return;
    }
    stopCamera();
    clearCapture();
    setCapturedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setError("");
  };

  const capture = () => {
    const video = videoRef.current;
    if (!video?.videoWidth) return;
    const size = Math.min(video.videoWidth, video.videoHeight);
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const context = canvas.getContext("2d");
    const sourceX = (video.videoWidth - size) / 2;
    const sourceY = (video.videoHeight - size) / 2;
    context.translate(canvas.width, 0);
    context.scale(-1, 1);
    context.drawImage(video, sourceX, sourceY, size, size, 0, 0, 512, 512);
    canvas.toBlob((blob) => {
      if (blob) selectFile(new File([blob], `facemoji-${Date.now()}.jpg`, { type: "image/jpeg" }));
    }, "image/jpeg", 0.9);
  };

  const saveReaction = async () => {
    if (!capturedFile || !name.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const { data: signature } = await clientServer.post("/face-reactions/upload-signature", {
        fileSize: capturedFile.size,
        fileType: capturedFile.type
      });
      const form = new FormData();
      form.append("file", capturedFile);
      form.append("api_key", signature.apiKey);
      form.append("timestamp", signature.timestamp);
      form.append("signature", signature.signature);
      form.append("public_id", signature.publicId);
      form.append("overwrite", String(signature.overwrite));
      form.append("transformation", signature.transformation);
      const upload = await axios.post(
        `https://api.cloudinary.com/v1_1/${signature.cloudName}/image/upload`,
        form
      );
      const { data } = await clientServer.post("/face-reactions", {
        name: name.trim(),
        publicId: upload.data.public_id
      });
      setLibrary((items) => [data.reaction, ...items]);
      setName("");
      clearCapture();
      setCreating(false);
    } catch (requestError) {
      setError(requestError.response?.data?.message || requestError.message || "Could not save your FaceMoji.");
    } finally {
      setBusy(false);
    }
  };

  const chooseReaction = async (reaction) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const { data } = await clientServer.put(`/post/${postId}/face-reaction`, {
        reactionId: reaction._id
      });
      onChange(data.faceReactions || []);
      closePicker();
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Could not add your FaceMoji.");
    } finally {
      setBusy(false);
    }
  };

  const removeReaction = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { data } = await clientServer.delete(`/post/${postId}/face-reaction`);
      onChange(data.faceReactions || []);
      closePicker();
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Could not remove your FaceMoji.");
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteReaction = async (reaction) => {
  if (busy) return;

  setBusy(true);
  setError("");

  try {
    await clientServer.delete(
      `/face-reactions/${reaction._id}`
    );

    setLibrary((items) =>
      items.filter((item) => item._id !== reaction._id)
    );
    setReactionToDelete(null);
  } catch (requestError) {
    setError(
      requestError.response?.data?.message ||
      "Could not delete your FaceMoji."
    );
  } finally {
    setBusy(false);
  }
};

  return (
    <>
      <button className={currentReaction ? styles.triggerActive : ""} type="button" onClick={openPicker} aria-label="Choose a FaceMoji reaction" aria-expanded={open}>
        {currentReaction?.reactionId?.imageUrl ? (
          <img className={styles.triggerFace} src={currentReaction.reactionId.imageUrl} alt="Your FaceMoji reaction" />
        ) : <span className={styles.faceGlyph} aria-hidden="true">☺</span>}
        <span>{reactionCount}</span>
      </button>

      {open && (
        <div className={styles.backdrop} role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closePicker()}>
          <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby={`face-reaction-title-${postId}`}>
            <header>
              <div>
                <h2 id={`face-reaction-title-${postId}`}>Your FaceMojis</h2>
                <p>React as yourself.</p>
              </div>
              <button className={styles.close} type="button" onClick={closePicker} aria-label="Close">×</button>
            </header>

            {!creating ? (
              <>
                <div className={styles.library}>
                  {library.map((reaction) => (
                    <div className={styles.reactionTile} key={reaction._id}>
                      <button
                        className={styles.selectReaction}
                        type="button"
                        disabled={busy}
                        onClick={() => chooseReaction(reaction)}
                      >
                        <img src={reaction.imageUrl} alt="" />
                        <span>{reaction.name}</span>
                      </button>
                      <button
                        className={styles.deleteReaction}
                        type="button"
                        disabled={busy}
                        onClick={() => setReactionToDelete(reaction)}
                        aria-label={`Delete ${reaction.name}`}
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  ))}
                  {library.length < 8 && (
                    <button className={styles.createTile} type="button" onClick={() => setCreating(true)}>
                      <strong>＋</strong><span>Create</span>
                    </button>
                  )}
                </div>
                {currentReaction && <button className={styles.remove} type="button" onClick={removeReaction}>Remove my reaction</button>}
              </>
            ) : (
              <div className={styles.creator}>
                <div className={styles.preview}>
                  {previewUrl ? <img src={previewUrl} alt="Your FaceMoji preview" /> : <video ref={videoRef} muted playsInline />}
                  {!previewUrl && !cameraReady && <span>Your camera preview will appear here</span>}
                </div>
                <div className={styles.controls}>
                  {!cameraReady && !previewUrl && <button type="button" onClick={startCamera}>Open camera</button>}
                  {cameraReady && <button type="button" onClick={capture}>Capture expression</button>}
                  <button type="button" onClick={() => fileInputRef.current?.click()}>Upload photo</button>
                  <input ref={fileInputRef} hidden type="file" accept="image/*" capture="user" onChange={(event) => selectFile(event.target.files?.[0])} />
                </div>
                {previewUrl && (
                  <label className={styles.nameField}>
                    Name this expression
                    <input value={name} maxLength={24} placeholder="Shocked, laughing…" onChange={(event) => setName(event.target.value)} />
                  </label>
                )}
                <div className={styles.footer}>
                  <button type="button" onClick={() => { stopCamera(); clearCapture(); setCreating(false); }}>Back</button>
                  {previewUrl && <button className={styles.primary} type="button" disabled={!name.trim() || busy} onClick={saveReaction}>{busy ? "Saving…" : "Save FaceMoji"}</button>}
                </div>
              </div>
            )}
            {error && <p className={styles.error} role="alert">{error}</p>}
          </section>
        </div>
      )}
      {reactionToDelete && (
        <div className={styles.confirmBackdrop} role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !busy && setReactionToDelete(null)}>
          <section className={styles.confirmDialog} role="alertdialog" aria-modal="true" aria-labelledby={`delete-reaction-title-${reactionToDelete._id}`} aria-describedby={`delete-reaction-description-${reactionToDelete._id}`}>
            <img src={reactionToDelete.imageUrl} alt="" />
            <h2 id={`delete-reaction-title-${reactionToDelete._id}`}>Delete “{reactionToDelete.name}”?</h2>
            <p id={`delete-reaction-description-${reactionToDelete._id}`}>
              This FaceMoji will be removed from your library. Reactions already placed on posts will remain visible.
            </p>
            {error && <p className={styles.confirmError} role="alert">{error}</p>}
            <div className={styles.confirmActions}>
              <button type="button" disabled={busy} onClick={() => setReactionToDelete(null)}>Cancel</button>
              <button className={styles.confirmDelete} type="button" disabled={busy} onClick={() => handleDeleteReaction(reactionToDelete)}>
                {busy ? "Deleting…" : "Delete FaceMoji"}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

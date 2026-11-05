import { clientServer } from "@/config";

export const REPORT_REASONS = [
  { value: "spam", label: "Spam" },
  { value: "harassment", label: "Harassment or bullying" },
  { value: "hate", label: "Hate speech" },
  { value: "violence", label: "Violence or threats" },
  { value: "nudity", label: "Nudity or sexual content" },
  { value: "scam", label: "Scam or fraud" },
  { value: "self_harm", label: "Self-harm" },
  { value: "other", label: "Something else" },
];

export const blockUser = (userId) => clientServer.post(`/safety/block/${userId}`);
export const unblockUser = (userId) => clientServer.delete(`/safety/block/${userId}`);
export const muteUser = (userId) => clientServer.post(`/safety/mute/${userId}`);
export const unmuteUser = (userId) => clientServer.delete(`/safety/mute/${userId}`);

export const fetchRestrictions = async () => {
  const response = await clientServer.get("/safety/restrictions");
  return response.data.restrictions || [];
};

export const reportContent = ({ targetType, targetId, reason, details }) =>
  clientServer.post("/safety/report", { targetType, targetId, reason, details });

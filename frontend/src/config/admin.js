import { clientServer } from "@/config";

// One answer per login token - the Sidebar mounts on every page, so without
// this every navigation would ask the server again.
let cached = { token: null, promise: null };

export const fetchAdminStatus = () => {
  const token = typeof window === "undefined" ? null : localStorage.getItem("token");
  if (cached.promise && cached.token === token) return cached.promise;
  cached = {
    token,
    promise: clientServer
      .get("/admin/me")
      .then((response) => Boolean(response.data.isAdmin))
      .catch(() => false),
  };
  return cached.promise;
};

export const fetchReports = async ({ status = "open", before } = {}) => {
  const params = { status };
  if (before) params.before = before;
  const response = await clientServer.get("/admin/reports", { params });
  return response.data;
};

export const updateReport = (reportId, { status, contentAction }) =>
  clientServer.patch(`/admin/reports/${reportId}`, { status, contentAction });

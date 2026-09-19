import { clientServer } from "@/config";

export const fetchReels = async ({ before, limit } = {}) => {
    const params = {};
    if (before) params.before = before;
    if (limit) params.limit = limit;
    const response = await clientServer.get("/reels", { params });
    return response.data;
};

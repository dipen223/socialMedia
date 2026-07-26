import { createAsyncThunk } from "@reduxjs/toolkit";
import { clientServer } from "@/config";

const getErrorMessage = (error, fallback) =>
  error.response?.data?.message || error.message || fallback;

const getAuthConfig = () => {
  const token =
    typeof window !== "undefined" ? window.localStorage.getItem("token") : null;

  return token
    ? { headers: { Authorization: `Bearer ${token}` } }
    : {};
};

export const getNotifications = createAsyncThunk(
  "notifications/getNotifications",
  async (_, thunkAPI) => {
    try {
      const response = await clientServer.get("/notifications", getAuthConfig());
      return response.data;
    } catch (error) {
      return thunkAPI.rejectWithValue(
        getErrorMessage(error, "Failed to retrieve notifications.")
      );
    }
  },
  {
    condition: () =>
      typeof window !== "undefined" &&
      Boolean(window.localStorage.getItem("token")),
  }
);

export const markNotificationRead = createAsyncThunk(
  "notifications/markNotificationRead",
  async (notificationId, thunkAPI) => {
    try {
      const response = await clientServer.patch(
        `/notifications/${notificationId}/read`,
        {},
        getAuthConfig()
      );
      return response.data;
    } catch (error) {
      return thunkAPI.rejectWithValue(
        getErrorMessage(error, "Failed to update the notification.")
      );
    }
  }
);

export const markAllNotificationsRead = createAsyncThunk(
  "notifications/markAllNotificationsRead",
  async (_, thunkAPI) => {
    try {
      const response = await clientServer.patch(
        "/notifications/read-all",
        {},
        getAuthConfig()
      );
      return response.data;
    } catch (error) {
      return thunkAPI.rejectWithValue(
        getErrorMessage(error, "Failed to update notifications.")
      );
    }
  }
);

import { createSlice } from "@reduxjs/toolkit";
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../../action/notificationAction";
import { logout } from "../authReducer";

const initialState = {
  notifications: [],
  unreadCount: 0,
  isLoading: false,
  isUpdating: false,
  hasFetched: false,
  error: "",
};

const notificationSlice = createSlice({
  name: "notifications",
  initialState,
  reducers: {
    clearNotificationError: (state) => {
      state.error = "";
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(getNotifications.pending, (state) => {
        state.isLoading = true;
        state.error = "";
      })
      .addCase(getNotifications.fulfilled, (state, action) => {
        state.isLoading = false;
        state.hasFetched = true;
        state.error = "";
        state.notifications = action.payload.notifications || [];
        state.unreadCount = action.payload.unreadCount || 0;
      })
      .addCase(getNotifications.rejected, (state, action) => {
        state.isLoading = false;
        state.hasFetched = true;
        state.error =
          action.payload || "Failed to retrieve notifications.";
      })
      .addCase(markNotificationRead.fulfilled, (state, action) => {
        const updated = action.payload.notification;
        const notification = state.notifications.find(
          (item) => item._id === updated._id
        );

        if (notification && !notification.readAt) {
          notification.readAt = updated.readAt;
          state.unreadCount = Math.max(0, state.unreadCount - 1);
        }
      })
      .addCase(markNotificationRead.rejected, (state, action) => {
        state.error =
          action.payload || "Failed to update the notification.";
      })
      .addCase(markAllNotificationsRead.pending, (state) => {
        state.isUpdating = true;
        state.error = "";
      })
      .addCase(markAllNotificationsRead.fulfilled, (state) => {
        state.isUpdating = false;
        state.unreadCount = 0;
        const readAt = new Date().toISOString();
        state.notifications.forEach((notification) => {
          notification.readAt ||= readAt;
        });
      })
      .addCase(markAllNotificationsRead.rejected, (state, action) => {
        state.isUpdating = false;
        state.error =
          action.payload || "Failed to update notifications.";
      })
      .addCase(logout, () => initialState);
  },
});

export const { clearNotificationError } = notificationSlice.actions;
export default notificationSlice.reducer;

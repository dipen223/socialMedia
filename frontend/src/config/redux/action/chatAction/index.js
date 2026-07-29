import { createAsyncThunk } from "@reduxjs/toolkit";
import { clientServer } from "@/config";

const getErrorMessage = (error, fallback) =>
  error.response?.data?.message ||
  error.message ||
  fallback;

export const getConversations = createAsyncThunk(
  "chat/getConversations",
  async (_, thunkAPI) => {
    try {
      const response = await clientServer.get(
        "/conversations"
      );

      return response.data;
    } catch (error) {
      return thunkAPI.rejectWithValue(
        getErrorMessage(
          error,
          "Could not retrieve conversations."
        )
      );
    }
  }
);

export const getMessages = createAsyncThunk(
  "chat/getMessages",
  async (
    {
      conversationId,
      before = null,
    },
    thunkAPI
  ) => {
    try {
      const response = await clientServer.get(
        `/conversations/${conversationId}/messages`,
        {
          params: before
            ? { before }
            : {},
        }
      );

      return {
        conversationId,
        isOlderPage: Boolean(before),
        ...response.data,
      };
    } catch (error) {
      return thunkAPI.rejectWithValue(
        getErrorMessage(
          error,
          "Could not retrieve messages."
        )
      );
    }
  }
);
import { createAsyncThunk } from "@reduxjs/toolkit";
import { clientServer } from "@/config";

export const getAllProfiles = createAsyncThunk(
  "profiles/getAllProfiles",
  async (_, thunkAPI) => {
    try {
      const response = await clientServer.get("/getAllUsers");
      return response.data;
    } catch (error) {
      return thunkAPI.rejectWithValue(
        error.response?.data?.message ||
          error.message ||
          "Failed to fetch profiles"
      );
    }
  }
);

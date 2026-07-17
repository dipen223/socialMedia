import { createAsyncThunk } from "@reduxjs/toolkit";
import { clientServer } from "@/config/index.jsx";

const getErrorMessage = (error) =>
  error.response?.data?.message || error.message || "Something went wrong";


export const loginUser = createAsyncThunk(
  "auth/login",
  async ({ email, password }, thunkAPI) => {
    try {
      const response = await clientServer.post("/login", { email, password });
      localStorage.setItem("token", response.data.token);
      return response.data;
    } catch (error) {
      return thunkAPI.rejectWithValue(getErrorMessage(error));
    }
  },
);

export const registerUser = createAsyncThunk(
  "auth/register",
  async ({ name, username, email, password }, thunkAPI) => {
    try {
      const response = await clientServer.post("/signup", {
        name,
        username,
        email,
        password,
      });
      localStorage.setItem("token", response.data.token);
      return response.data;
    } catch (error) {
      return thunkAPI.rejectWithValue(getErrorMessage(error));
    }
  },
);


export const getUserProfile = createAsyncThunk(
  "auth/getUserProfile",
  async (_, thunkAPI) => {
    try {
      const response = await clientServer.get("/profile");
      return response.data;
    } catch (error) {
      return thunkAPI.rejectWithValue(
        error.response?.data?.message ||
          error.message ||
          "Failed to fetch profile"
      );
    }
  }
);

import { clientServer } from "@/config";
import { createAsyncThunk } from "@reduxjs/toolkit";

export const correctGrammar = createAsyncThunk(
  "ai/correctGrammar",
  async (text, thunkAPI) => {
    try {
      const response = await clientServer.post("/ai/grammar", { text });
      return response.data;
    } catch (error) {
      return thunkAPI.rejectWithValue(
        error.response?.data?.message || error.message || "Grammar checking failed."
      );
    }
  }
);

export const generatePostImage = createAsyncThunk(
  "ai/generatePostImage",
  async ({ prompt, previousPublicId }, thunkAPI) => {
    try {
      const response = await clientServer.post("/ai/image", { prompt, previousPublicId });
      return response.data.image;
    } catch (error) {
      return thunkAPI.rejectWithValue(
        error.response?.data?.message || error.message || "Image generation failed."
      );
    }
  }
);

export const deleteGeneratedImage = createAsyncThunk(
  "ai/deleteGeneratedImage",
  async (publicId, thunkAPI) => {
    try {
      await clientServer.delete("/ai/image", { data: { publicId } });
      return publicId;
    } catch (error) {
      return thunkAPI.rejectWithValue(
        error.response?.data?.message || error.message || "Could not remove the generated image."
      );
    }
  }
);

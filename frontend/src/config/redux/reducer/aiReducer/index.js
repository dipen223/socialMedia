import { createSlice } from "@reduxjs/toolkit";
import { correctGrammar, deleteGeneratedImage, generatePostImage } from "../../action/aiAction";

const initialState = {
  original: "",
  suggestion: "",
  isCorrecting: false,
  error: "",
  generatedImage: null,
  isGeneratingImage: false,
  imageError: "",
};

const aiSlice = createSlice({
  name: "ai",
  initialState,
  reducers: {
    clearGrammarSuggestion: (state) => {
      state.original = "";
      state.suggestion = "";
      state.error = "";
    },
    clearGeneratedImage: (state) => {
      state.generatedImage = null;
      state.imageError = "";
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(correctGrammar.pending, (state) => {
        state.isCorrecting = true;
        state.error = "";
        state.suggestion = "";
      })
      .addCase(correctGrammar.fulfilled, (state, action) => {
        state.isCorrecting = false;
        state.original = action.payload.original;
        state.suggestion = action.payload.suggestion;
      })
      .addCase(correctGrammar.rejected, (state, action) => {
        state.isCorrecting = false;
        state.error = action.payload || "Grammar checking failed.";
      })
      .addCase(generatePostImage.pending, (state) => {
        state.isGeneratingImage = true;
        state.imageError = "";
      })
      .addCase(generatePostImage.fulfilled, (state, action) => {
        state.isGeneratingImage = false;
        state.generatedImage = action.payload;
      })
      .addCase(generatePostImage.rejected, (state, action) => {
        state.isGeneratingImage = false;
        state.imageError = action.payload || "Image generation failed.";
      })
      .addCase(deleteGeneratedImage.fulfilled, (state, action) => {
        if (state.generatedImage?.publicId === action.payload) {
          state.generatedImage = null;
        }
      });
  },
});

export const { clearGrammarSuggestion, clearGeneratedImage } = aiSlice.actions;
export default aiSlice.reducer;

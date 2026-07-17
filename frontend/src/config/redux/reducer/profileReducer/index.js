import { createSlice } from "@reduxjs/toolkit";
import { getAllProfiles } from "@/config/redux/action/profileAction";

const initialState = {
  profiles: [],
  isLoading: false,
  isError: false,
  message: "",
  hasFetched: false,
};

const profileSlice = createSlice({
  name: "profiles",
  initialState,
  reducers: {
    resetProfiles: () => initialState,
  },
  extraReducers: (builder) => {
    builder
      .addCase(getAllProfiles.pending, (state) => {
        state.isLoading = true;
        state.isError = false;
        state.message = "";
      })
      .addCase(getAllProfiles.fulfilled, (state, action) => {
        state.isLoading = false;
        state.hasFetched = true;
        state.profiles = action.payload.profiles;
      })
      .addCase(getAllProfiles.rejected, (state, action) => {
        state.isLoading = false;
        state.isError = true;
        state.message = action.payload || "Failed to fetch profiles";
      });
  },
});

export const { resetProfiles } = profileSlice.actions;
export default profileSlice.reducer;

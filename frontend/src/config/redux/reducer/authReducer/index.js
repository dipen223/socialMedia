import { createSlice } from "@reduxjs/toolkit";
import { loginUser, registerUser,getUserProfile} from "@/config/redux/action/authAction";

const initialState = {
  user: null,
  isError: false,
  isSuccess: false,
  isLoading: false,
  isLoggedIn: false,
  message: "",
};

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    clearAuthMessage: (state) => {
      state.isError = false;
      state.isSuccess = false;
      state.message = "";
    },
    logout: (state) => {
      localStorage.removeItem("token");
      Object.assign(state, initialState);
    },
  },
  extraReducers: (builder) => {
    
    [loginUser, registerUser].forEach((request) => {
      builder
        .addCase(request.pending, (state) => {
          state.isLoading = true;
          state.isError = false;
          state.isSuccess = false;
          state.message = "";
        })
        .addCase(request.fulfilled, (state, action) => {
          state.isLoading = false;
          state.isSuccess = true;
          state.isLoggedIn = true;
          state.user = action.payload.user;
          state.message = action.payload.message;
        })
        .addCase(request.rejected, (state, action) => {
          state.isLoading = false;
          state.isError = true;
          state.isLoggedIn = false;
          state.message = action.payload || "Request failed";
        });
    });
     builder
    .addCase(getUserProfile.pending, (state) => {
      state.isLoading = true;
      state.isError = false;
      state.message = "";
    })
    .addCase(getUserProfile.fulfilled, (state, action) => {
      state.isLoading = false;
      state.isSuccess = true;
      state.isLoggedIn = true;
      state.user = action.payload;
    })
    .addCase(getUserProfile.rejected, (state, action) => {
      state.isLoading = false;
      state.isError = true;
      state.isLoggedIn = false;
      state.user = null;
      state.message = action.payload || "Failed to fetch profile";
    });

  },
});

export const { clearAuthMessage, logout } = authSlice.actions;
export default authSlice.reducer;

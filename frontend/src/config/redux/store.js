import { configureStore } from "@reduxjs/toolkit";
import authReducer from "@/config/redux/reducer/authReducer";

const store = configureStore({
  reducer: {
    auth: authReducer,
  },
});

export default store;

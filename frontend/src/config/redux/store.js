import { configureStore } from "@reduxjs/toolkit";
import authReducer from "@/config/redux/reducer/authReducer";
import postReducer from "@/config/redux/reducer/postReducer";

const store = configureStore({
  reducer: {
    auth: authReducer,
    posts:postReducer,
  },
});

export default store;

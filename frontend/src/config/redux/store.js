import { configureStore } from "@reduxjs/toolkit";
import authReducer from "@/config/redux/reducer/authReducer";
import postReducer from "@/config/redux/reducer/postReducer";
import profileReducer from "@/config/redux/reducer/profileReducer";

const store = configureStore({
  reducer: {
    auth: authReducer,
    posts: postReducer,
    profiles: profileReducer,
  },
});

export default store;

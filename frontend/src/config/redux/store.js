import { configureStore } from "@reduxjs/toolkit";
import authReducer from "@/config/redux/reducer/authReducer";
import postReducer from "@/config/redux/reducer/postReducer";
import profileReducer from "@/config/redux/reducer/profileReducer";
import aiReducer from "@/config/redux/reducer/aiReducer";
import commentReducer from "@/config/redux/reducer/commentReducer";

const store = configureStore({
  reducer: {
    auth: authReducer,
    posts: postReducer,
    profiles: profileReducer,
    ai: aiReducer,
    comments:commentReducer,
  },
});

export default store;

import { clientServer } from "@/config";
import { createAsyncThunk } from "@reduxjs/toolkit";

export const getAllPosts = createAsyncThunk(
    "post/getAllPosts", async (_, thunkAPI) => {
        try {

            const response = await clientServer.get("/allPosts");
            return thunkAPI.fulfillWithValue(response.data);

        } catch (err) {
            return thunkAPI.rejectWithValue(
                err.response?.data?.message || err.message || "Failed to fetch posts"
            );
        }
    }
)

export const createNewPost = createAsyncThunk(
    "post/createNewPost",
    async ({ body, media }, thunkAPI) => {
        try {
            const formData = new FormData();
            formData.append("body", body);

            if (media) {
                formData.append("media", media);
            }

            const response = await clientServer.post("/post", formData);
            return response.data;
        } catch (err) {
            return thunkAPI.rejectWithValue(
                err.response?.data?.message || err.message || "Failed to create post"
            );
        }
    }
);

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
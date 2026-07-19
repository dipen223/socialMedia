import { createAsyncThunk } from "@reduxjs/toolkit";
import { clientServer } from "@/config";

export const getCommentsByPost = createAsyncThunk(
    "comment/getCommentsByPost",
    async (postId, thunkAPI) => {
        try {
            const response = await clientServer.get(`/posts/${postId}/comments`);
            return {
                postId,
                comments: response.data.comments,
                count: response.data.count
            };
        } catch (err) {
            return thunkAPI.rejectWithValue(
                err.response?.data?.message || err.message || "Failed to fetch comments"
            );
        }
    }
);


export const createNewComment = createAsyncThunk(
    "comment/createNewComment",
    async ({ postId, body }, thunkAPI) => {
        try {
            const response = await clientServer.post(`/posts/${postId}/comment`, { body });
            return {
                postId,
                comment: response.data.comment
            };
        } catch (err) {
            return thunkAPI.rejectWithValue(
                err.response?.data?.message || err.message || "Failed to create comment"
            );
        }
    }
);

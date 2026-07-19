import { createSlice } from "@reduxjs/toolkit";
import { createNewComment, getCommentsByPost } from "../../action/commentAction";

const initialState = {
    commentsByPost: {},
    fetchedPostIds: {},
    loadingForPostId: null,
    creatingForPostId: null,
    isError: false,
    message: "",
};

const commentSlice = createSlice({
    name: "comment",
    initialState,
    reducers: {
        clearCommentError: (state) => {
            state.isError = false;
            state.message = "";
        },


    },
    extraReducers: (builder) => {
        builder
            .addCase(getCommentsByPost.pending, (state, action) => {
                state.loadingForPostId = action.meta.arg;
                state.isError = false;
                state.message = "";
            })
            .addCase(getCommentsByPost.fulfilled, (state, action) => {
                const { postId, comments } = action.payload;
                state.commentsByPost[postId] = comments;
                state.fetchedPostIds[postId] = true;
                state.loadingForPostId = null;
            })
            .addCase(getCommentsByPost.rejected, (state, action) => {
                state.loadingForPostId = null;
                state.isError = true;
                state.message = action.payload || "Failed to fetch comments";
            })
            .addCase(
                createNewComment.pending, (state, action) => {
                    state.creatingForPostId = action.meta.arg.postId;
                    state.isError = false;
                    state.message = "";
                })

            .addCase(createNewComment.fulfilled, (state, action) => {
                const { postId, comment } = action.payload;
                if (!state.commentsByPost[postId]) {
                    state.commentsByPost[postId] = [];
                }

                state.commentsByPost[postId].push(comment);
                state.creatingForPostId = null
            })
            .addCase(createNewComment.rejected, (state, action) => {
                state.creatingForPostId = null;
                state.isError = true;
                state.message =
                    action.payload || "Failed to create comment";
            });


    }
});

export const { clearCommentError } = commentSlice.actions;
export default commentSlice.reducer;

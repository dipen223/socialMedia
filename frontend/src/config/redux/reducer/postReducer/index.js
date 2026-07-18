import { createSlice } from "@reduxjs/toolkit";
import { createNewPost, getAllPosts, deletePost, likePost } from "../../action/postAction";

const initialState = {
    posts: [],
    count: 0,
    isLoading: false,
    isError: false,
    message: "",
    postFetched: false,
    isCreating: false,
    createError: "",
    uploadProgress: 0,
    deletingPostId: null,
    deleteError: "",
    likingPostId: null,
    likeError: "",

};

const postSlice = createSlice({
    name: "post",
    initialState,
    reducers: {
        reset: () => initialState,
        setUploadProgress: (state, action) => {
            state.uploadProgress = action.payload;
        },
        resetPostId: (state) => {
            state.postId = ""
        },
    },
    extraReducers: (builder) => {
        builder.
            addCase(getAllPosts.pending, (state) => {
                state.isLoading = true
                state.message = "Fetching all the posts.."
            })
            .addCase(getAllPosts.fulfilled, (state, action) => {
                state.isLoading = false;
                state.isError = false;
                state.postFetched = true;
                state.posts = action.payload.posts.reverse()
            })
            .addCase(getAllPosts.rejected, (state, action) => {
                state.isLoading = false;
                state.isError = true;
                state.message = action.payload
            })
            .addCase(createNewPost.pending, (state) => {
                state.isCreating = true;
                state.createError = "";
                state.uploadProgress = 0;
            })
            .addCase(createNewPost.fulfilled, (state) => {
                state.isCreating = false;
                state.uploadProgress = 0;
            })
            .addCase(createNewPost.rejected, (state, action) => {
                state.isCreating = false;
                state.createError = action.payload || "Failed to create post";
                state.uploadProgress = 0;
            }).addCase(deletePost.pending, (state, action) => {
                state.deletingPostId = action.meta.arg;
                state.deleteError = "";
            })
            .addCase(deletePost.fulfilled, (state, action) => {
                state.deletingPostId = null;

                state.posts = state.posts.filter(
                    (post) => post._id !== action.payload.postId
                );

                state.count = state.posts.length;
            })
            .addCase(deletePost.rejected, (state, action) => {
                state.deletingPostId = null;
                state.deleteError =
                    action.payload || "Failed to delete post";
            }).addCase(likePost.pending, (state, action) => {
                state.likingPostId = action.meta.arg;
                state.likeError = "";
            })
            .addCase(likePost.fulfilled, (state, action) => {
                state.likingPostId = null;

                const post = state.posts.find(
                    (post) => post._id === action.payload.postId
                );

                if (post) {
                    post.likedBy= action.payload.likedBy;
                }
            })
            .addCase(likePost.rejected, (state, action) => {
                state.likingPostId = null;
                state.likeError =
                    action.payload || "Failed to like post";
            });
    }

});

export const { reset, resetPostId, setUploadProgress } = postSlice.actions;
export default postSlice.reducer;

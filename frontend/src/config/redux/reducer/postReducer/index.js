import { createSlice } from "@reduxjs/toolkit";
import { createNewPost, getAllPosts } from "../../action/postAction";

const initialState = {
  posts: [],
  count: 0,
  isLoading: false,
  isError: false,
  message: "",
  postFetched:false,
  isCreating: false,
  createError: "",
};

const postSlice  = createSlice({
    name:"post",
    initialState,
    reducers:{
        reset:()=>initialState,
        resetPostId:(state) =>{
            state.postId = ""
        },
    },
    extraReducers:(builder)=>{
        builder.
        addCase(getAllPosts.pending,(state)=>{
            state.isLoading=true
            state.message = "Fetching all the posts.."
        })
        .addCase(getAllPosts.fulfilled,(state,action) =>{
            state.isLoading = false;
            state.isError = false;
            state.postFetched=true;
            state.posts = action.payload.posts
        })
        .addCase(getAllPosts.rejected,(state,action) => {
            state.isLoading = false;
            state.isError = true;
            state.message = action.payload
        })
        .addCase(createNewPost.pending, (state) => {
            state.isCreating = true;
            state.createError = "";
        })
        .addCase(createNewPost.fulfilled, (state) => {
            state.isCreating = false;
        })
        .addCase(createNewPost.rejected, (state, action) => {
            state.isCreating = false;
            state.createError = action.payload || "Failed to create post";
        })
    }

});

export const { reset, resetPostId } = postSlice.actions;
export default postSlice.reducer;

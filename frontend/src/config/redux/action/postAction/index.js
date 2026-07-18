import { clientServer } from "@/config";
import { createAsyncThunk } from "@reduxjs/toolkit";
import axios from "axios";

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
            let uploadedMedia = {};

            if (media) {
                const { data: signedUpload } = await clientServer.post("/media/upload-signature", {
                    fileSize: media.size,
                    fileType: media.type
                });

                const uploadData = new FormData();
                uploadData.append("file", media);
                uploadData.append("api_key", signedUpload.apiKey);
                uploadData.append("timestamp", signedUpload.timestamp);
                uploadData.append("signature", signedUpload.signature);
                uploadData.append("public_id", signedUpload.publicId);
                uploadData.append("overwrite", String(signedUpload.overwrite));

                const cloudinaryResponse = await axios.post(
                    `https://api.cloudinary.com/v1_1/${signedUpload.cloudName}/${signedUpload.resourceType}/upload`,
                    uploadData,
                    {
                        onUploadProgress: ({ loaded, total }) => {
                            if (total) {
                                thunkAPI.dispatch({
                                    type: "post/setUploadProgress",
                                    payload: Math.round((loaded * 100) / total)
                                });
                            }
                        }
                    }
                );

                uploadedMedia = {
                    mediaPublicId: cloudinaryResponse.data.public_id,
                    mediaResourceType: cloudinaryResponse.data.resource_type
                };
            }

            const response = await clientServer.post("/post", { body, ...uploadedMedia });
            return response.data;
        } catch (err) {
            return thunkAPI.rejectWithValue(
                err.response?.data?.message || err.response?.data?.error?.message || err.message || "Failed to create post"
            );
        }
    }
);


export const deletePost = createAsyncThunk("post/deletePost",
    async ( postId , thunkAPI) => {
        try {
            const response = await clientServer.delete(`/post/${postId}`);

            return {
                postId,
                message: response.data.message
            }


        } catch (err) {
            return thunkAPI.rejectWithValue(
                err.response?.data?.message || err.message || "Failed to delete post"
            );
        }
    }
);


export const likePost = createAsyncThunk("post/likePost",
    async (postId, thunkAPI) => {
        try {
            const response = await clientServer.patch(`/post/${postId}/like`);
            return {
                postId,
                liked: response.data.liked,
                likedBy: response.data.likedBy,
                likes: response.data.likes
            }

        } catch (err) {
            return thunkAPI.rejectWithValue(
                err.response?.data?.message || err.message || "Failed to like post"
            );
        }
    });

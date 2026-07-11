import User from "../models/user.model.js";
import Post from "../models/posts.model.js";
import cloudinary from "../config/cloudinary.js";
import Comment from "../models/comments.model.js";

const createPost = async (req,res) =>{
    const userId = req.user.id;

    try{
        const user = await User.findById(userId);
        if(!user){
            return res.status(404).json({message:"User not found!"});
        }

        let mediaUrl = "";
        let fileType = "";

        if(req.file){
            const fileBase64 = req.file.buffer.toString("base64");
            const fileUri = `data:${req.file.mimetype};base64,${fileBase64}`;

             const result = await cloudinary.uploader.upload(fileUri, {
                folder: "socialhub/posts",
                resource_type: "auto"
            });

            mediaUrl = result.secure_url;
            fileType = req.file.mimetype;
        }

        const post = await Post.create({
            userId,
            body:req.body.body,
            media:mediaUrl,
            fileType
        });

        return res.status(201).json({
            message:"Post created successfully!",
            post
        });


    }catch (err) {
        console.error("Error creating a post!", err.message);
        return res.status(500).json({ message: "Server error!" });
    }

};

const getAllPosts = async(req,res) =>{
 
    try{
        const posts = await Post.find({active:true}).populate("userId","name username email profilePicture");

       
        return res.status(200).json({count:posts.length,posts});

    }catch (err) {
        console.error("Error getting posts!", err.message);
        return res.status(500).json({ message: "Server error!" });
    }

};

const deletePost = async(req,res) =>{
    const userId = req.user.id;
    const {postId} = req.params;

    try{
        const post = await Post.findById(postId);
        if(!post){
            return res.status(404).json({message:"Post not found!"});
        }

        if(post.userId.toString() !== user._id.toString()){
            return res.status(401).json({message:"Unauthorized"});
        }

        await post.deleteOne();
        return res.status(200).json({message:"Post deleted!"});

    }catch (err) {
        console.error("Error deleting the post!", err.message);
        return res.status(500).json({ message: "Server error!" });
    }
};
const likePost = async (req, res) => {
    const { postId } = req.params;

    try {
        const post = await Post.findOneAndUpdate(
            {
                _id: postId,
                active: true
            },
            {
                $inc: { likes: 1 }
            },
            {
                new: true,
                runValidators: true
            }
        );

        if (!post) {
            return res.status(404).json({
                message: "Post not found!"
            });
        }

        return res.status(200).json({
            message: "Post liked!",
            likes: post.likes
        });
    } catch (err) {
        console.error("Error liking post:", err.message);

        return res.status(500).json({
            message: "Server error!"
        });
    }
};



export default {createPost,getAllPosts,deletePost,likePost};
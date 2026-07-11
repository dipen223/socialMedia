import User from "../models/user.model.js";
import Post from "../models/posts.model.js";
import cloudinary from "../config/cloudinary.js"

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

}

export default {createPost};
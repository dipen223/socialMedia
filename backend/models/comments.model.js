import mongoose,{Schema } from "mongoose";

const commentSchema = new Schema({
    userId:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"User",
    },
    postId:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"Post",
    },
    body:{
        type:String,
        required:true,
    }
}, { timestamps: true });


const Comment = new mongoose.model("Comment",commentSchema);
export default Comment;

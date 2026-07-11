import mongoose,{Schema} from "mongoose";

const postSchema = new Schema({
    userId:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"User",

    },
    body:{
        type:String,
        required:true

    },
    likes:{
        type:Number,
        default:0

    },
    media:{
        type:String,
        default:''

    },
    active:{
        type:Boolean,
        default:true,

    },
    fileType:{
        type:String,
        default:''

    }

},{
    timestamps:true
});


const Post =  new mongoose.model("Post",postSchema);

export default Post;
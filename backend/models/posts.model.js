import mongoose,{Schema} from "mongoose";

const postSchema = new Schema({
    userId:{

    },
    body:{
        type:String,
        required:true

    },
    likes:{
        type:Number,
        deault:0

    },
    createdAt:{
        type:Date,
        default:Date.now,

    },
    updatedAt:{
         type:Date,
        default:Date.now,

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

});


const Post =  new mongoose.Model("Post",postSchema);

export default Post;
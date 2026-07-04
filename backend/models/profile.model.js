import mongoose,{Schema} from "mognose";
import { model } from "mongoose";



const profileSchema = new Schema({
    userId:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"User",
    },
    bio:{
        type:String,
        default:"",
    },
    interests:{
        type:[String],
        default:[],
    },
    currentPost:{
        type:String,
        default:'',
    }
});

const Profile = new mongoose.Model("Profile",profileSchema);
import mongoose,{Schema} from "mongoose";

const userSchema = new Schema({
    name:{
        type:String,
        required:true,
    },
    username:{
        type:String,
        required:true,
        unique:true,
    },
    email:{
        type:String,
        required:true,
        unique:true,
    },
    password:{
        type:String,
        required:true,
    },
    profilePicture:{
        type:String,
        default:"default.jpg",
    },
    createdAt:{
        type:Date,
        default:Date.now,
    },
    updatedAt:{
        type:Date,
        default:Date.now,
    }
})
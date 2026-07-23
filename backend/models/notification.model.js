import mongoose,{Schema} from "mongoose";

const notificationSchema = new Schema({
    recipientId:{
        type:Schema.Types.Objectsid,
        ref:"User",
        required:true,
        index:true,
    },
    actorId:{
        type:Schema.Types.ObjectId,
        ref:"User",
        required:true,
    },
    type:{
        type:String,
        enum:[
            "connection_request",
            "connecction_accepted",
            "post_liked",
            "post_commented",
        ],
        required:true,
    },
    connectionId:{
        type:Schema.Types.ObjectId,
        ref:"Connection",
        default:null,
    },
    readAt:{
        type:Date,
        default:null,
    },

},
{
    timestamps:true,e
}
)


const Notification = mongoose.model("Notification",notificationSchema);

export default Notification;
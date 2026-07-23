import mongoose,{Schema} from "mongoose";

const connectionSchema = new Schema({
    requesterId:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"User",
        required:true,
    },
    recipientId:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"User",
        required:true,
    },
    status:{
        type:String,
        enum:["pending","accepted"],
        default:"pending",
    }
},
{
    timestamps:true,
});

connectionSchema.index(
  {
    requesterId: 1,
    recipientId: 1,
  },
  {
    unique: true,
  }
);


const Connection = mongoose.model("Conneciton",connectionSchema);
export default Connection;
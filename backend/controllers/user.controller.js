import User from "../models/user.model.js";
import Profile from "../models/profile.model.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

const signup = async (req, res) => {
    const { name, username, email, password } = req.body;

    if (!name || !username || !email || !password) {
        return res.status(400).json({ message: "All fields are required!" });
    }

    try {
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: "User already exists!" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({
            name,
            username,
            email,
            password: hashedPassword,
        });

        await newUser.save();
        const profile = new Profile({ userId: newUser._id });

        await profile.save();
        const token = jwt.sign({ id: newUser._id }, process.env.JWT_SECRET_KEY, {
            expiresIn: "1h",
        });


        res.status(201).json({
            message:"Account created successfully",
            token,
            user: {
                _id: newUser._id,
                name: newUser.name,
                username: newUser.username,
                email: newUser.email,
            },
        });

    } catch (err) {
        console.error("Error during signup:", err.message);
        res.status(500).json({ message: "Internal server error" });
    }
};


const login = async(req,res) =>{
    const {email,password} = req.body;
    if(!email || !password){
        return res.status(400).json({message:"All fields are required!"});
    }
    try{
        const existingUser = await User.findOne({email});
        if(!existingUser){
            return res.status(400).json({ message: "Invalid Credentials!" });
        }

        const isMatch = await bcrypt.compare(password,existingUser.password);
        if(!isMatch){
             return res.status(400).json({ message: "Invalid Credentials!" });
        }

         const token = jwt.sign({ id: existingUser._id }, process.env.JWT_SECRET_KEY, { expiresIn: "1h" });
         res.json({
            message:"Login Successsfull",
            token,
            user:{
                _id:existingUser._id,
                name:existingUser.name,
                username:existingUser.username,
                email: existingUser.email,

            }
         });
    }catch(err){
         console.error("Error during login:", err.message);
        res.status(500).send("Server error!");
    }
}


export default {signup,login};
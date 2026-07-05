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


export default {signup};
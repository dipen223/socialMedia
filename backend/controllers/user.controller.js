import User from "../models/user.model.js";
import Profile from "../models/profile.model.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import cloudinary from "../config/cloudinary.js";

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
            message: "Account created successfully",
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


const login = async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ message: "All fields are required!" });
    }
    try {
        const existingUser = await User.findOne({ email });
        if (!existingUser) {
            return res.status(401).json({ message: "Invalid Credentials!" });
        }

        const isMatch = await bcrypt.compare(password, existingUser.password);
        if (!isMatch) {
            return res.status(401).json({ message: "Invalid Credentials!" });
        }

        const token = jwt.sign({ id: existingUser._id }, process.env.JWT_SECRET_KEY, { expiresIn: "1h" });
        res.json({
            message: "Login Successsfull",
            token,
            user: {
                _id: existingUser._id,
                name: existingUser.name,
                username: existingUser.username,
                email: existingUser.email,

            }
        });
    } catch (err) {
        console.error("Error during login:", err.message);
        res.status(500).send("Server error!");
    }
};

const uploadProfile = async (req, res) => {

    const userId = req.user.id;
    try {
        if (!req.file) {
            return res.status(400).json({ message: "No file uploaded" });
        }

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: "User not found!" });

        const fileStr = req.file.buffer.toString("base64");
        const fileUri = `data:${req.file.mimetype};base64,${fileStr}`;

        const result = await cloudinary.uploader.upload(fileUri, {
            folder: "socialhub/profile_pictures",
        });

        user.profilePicture = result.secure_url;
        await user.save();

        res.json({
            message: "Profile updated",
            profilePicture: user.profilePicture
        });

   } catch (err) {
    console.error("UPLOAD ERROR:", err);
    console.error("MESSAGE:", err?.message);

    return res.status(500).json({
        message: "Server Error!",
        error: err?.message || err
    });
}

}

const updateUserProfile = async (req,res)=>{
    const userId = req.user.id;
    const {name,email,username} = req.body;
    try{
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: "User not found!" });

        if (!name && !email && !username) {
            return res.status(400).json({ message: "No fields provided to update!" });
        }

        if (email && email !== user.email) {
            const existingEmail = await User.findOne({ email });
            if (existingEmail) {
                return res.status(400).json({ message: "Email already in use!" });
            }
            user.email = email;
        }

        if (username && username !== user.username) {
            const existingUsername = await User.findOne({ username });
            if (existingUsername) {
                return res.status(400).json({ message: "Username already in use!" });
            }
            user.username = username;
        }

        if (name) {
            user.name = name;
        }

        await user.save();

        res.json({
            message: "User profile updated successfully",
            user: {
                _id: user._id,
                name: user.name,
                username: user.username,
                email: user.email,
            },
        });
    }catch(err){
        console.error("Error during updating user profile!",err.message);
        res.status(500).send("Server error!");
    }

}


export default { signup, login, uploadProfile,updateUserProfile };

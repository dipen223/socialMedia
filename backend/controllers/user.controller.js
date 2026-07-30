import User from "../models/user.model.js";
import Profile from "../models/profile.model.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import cloudinary from "../config/cloudinary.js";
import PDFDocument from "pdfkit";
const convertUserDataToPDF = async (userData) => {
    const document = new PDFDocument();
    const chunks = [];

    return await new Promise(async (resolve, reject) => {
        document.on("data", (chunk) => chunks.push(chunk));
        document.on("end", () => resolve(Buffer.concat(chunks)));
        document.on("error", reject);

        try {
            if (userData.userId.profilePicture) {
                const imageResponse = await fetch(userData.userId.profilePicture);

                if (imageResponse.ok) {
                    const imageArrayBuffer = await imageResponse.arrayBuffer();
                    const imageBuffer = Buffer.from(imageArrayBuffer);

                    document.image(imageBuffer, {
                        fit: [100, 100],
                        align: "center",
                    });
                    document.moveDown();
                }
            }
            document.fontSize(14);

            document.font("Helvetica-Bold").text("Name: ", { continued: true });
            document.font("Helvetica").text(userData.userId.name);

            document.font("Helvetica-Bold").text("Email: ", { continued: true });
            document.font("Helvetica").text(userData.userId.email);

            document.font("Helvetica-Bold").text("Username: ", { continued: true });
            document.font("Helvetica").text(userData.userId.username);

            document.font("Helvetica-Bold").text("Bio: ", { continued: true });
            document.font("Helvetica").text(userData.bio || "");

            document.font("Helvetica-Bold").text("Interests: ", { continued: true });
            document.font("Helvetica").text((userData.interests || []).join(", "));

            document.font("Helvetica-Bold").text("Current Post: ", { continued: true });
            document.font("Helvetica").text(userData.currentPost || "");

            document.end();
        } catch (err) {
            reject(err);
        }
    });
};
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
            expiresIn: "5d",
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

        const token = jwt.sign(
            { id: existingUser._id },
            process.env.JWT_SECRET_KEY,
            { expiresIn: "5d" }
        );
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
            folder: "ripple/profile_pictures",
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

const uploadCoverPhoto = async (req, res) => {
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
            folder: "ripple/cover_photos",
        });

        let profile = await Profile.findOne({ userId });
        if (!profile) {
            profile = new Profile({ userId });
        }

        profile.coverPhoto = result.secure_url;
        await profile.save();

        res.json({
            message: "Cover photo updated successfully",
            coverPhoto: profile.coverPhoto,
        });

    } catch (err) {
        console.error("COVER PHOTO UPLOAD ERROR:", err);
        return res.status(500).json({
            message: "Server Error!",
            error: err?.message || err,
        });
    }
};

const updateUserProfile = async (req, res) => {
    const userId = req.user.id;
    const { name, email, username } = req.body;
    try {
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
    } catch (err) {
        console.error("Error during updating user profile!", err.message);
        res.status(500).send("Server error!");
    }

};

const getUserProfile = async (req, res) => {
    const userId = req.user.id;
    try {
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: "User not found!" });

        const userProfile = await Profile.findOne({ userId: user._id }).populate("userId", "name username email profilePicture");

        if (!userProfile) {
            return res.status(404).json({ message: "Profile not found!" });
        }

        return res.json(userProfile);

    } catch (err) {
        console.error("Error fetching user info & profile!", err.message);
        res.status(500).send("Server error!");
    }


};

const updateProfileData = async (req, res) => {
    const userId = req.user.id;
    const { ...newProfileData } = req.body;

    try {
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: "User not found!" });
        }

        const profileToUpdate = await Profile.findOne({ userId });
        Object.assign(profileToUpdate, newProfileData);

        await profileToUpdate.save();

        return res.json({ message: "profile updated!" });

    } catch (err) {
        console.error("Error updating profile information!", err.message);
        res.status(500).send("Server error!");
    }
};

const getAllUserProfile = async (req, res) => {
    ;

    try {
        const profiles = await Profile.find().populate("userId", "name username email profilePicture");

        if (profiles.length == 0) {
            return res.status(404).json({ message: "Profiles not found!" });
        }

        return res.status(200).json({ profiles });
    } catch (err) {
        console.error("Error fetching profiles!", err.message);
        res.status(500).send("Server error!");
    }
};
const downloadProfile = async (req, res) => {
    const userId = req.query.id;

    try {
        const userProfile = await Profile.findOne({ userId }).populate(
            "userId",
            "name username email profilePicture"
        );

        if (!userProfile) {
            return res.status(404).json({ message: "Profile not found" });
        }

        const pdfBuffer = await convertUserDataToPDF(userProfile);

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
            "Content-Disposition",
            `attachment; filename="${userProfile.userId.username}-profile.pdf"`
        );

        return res.status(200).send(pdfBuffer);
    } catch (err) {
        console.error("Error downloading profile!", err.message);
        return res.status(500).json({ message: "Server error!" });
    }
};


const escapeRegExp = (value) => {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};


const searchPeople = async (req, res) => {
    const query = typeof req.query.q == "string" ? req.query.q.trim() : "";
    if (query.length < 2) {
        return res.status(200).json({ people: [] });
    }

    if (query.length > 50) {
        return res.status(400).json({ message: "Search cannot exceed 50 characters." });
    }

    try {
        const safeQuery = escapeRegExp(query);

        const people = await User.find({
            $or: [
                {
                    name: {
                        $regex: safeQuery,
                        $options: "i",
                    },
                },
                {
                    username: {
                        $regex: safeQuery,
                        $options: "i",
                    }

                },
            ],
        }).select("name username profilePicture").
            limit(8)
            .lean();


        return res.status(200).json({ people });

    }
    catch (error) {
        console.error("People search failed:", error.message);

        return res.status(500).json({
            message: "Could not search for people.",
        });
    }

}

export default {
    signup,
    login,
    uploadProfile,
    uploadCoverPhoto,
    updateUserProfile,
    getUserProfile,
    updateProfileData,
    getAllUserProfile,
    downloadProfile,
    searchPeople
};

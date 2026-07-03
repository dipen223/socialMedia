import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import bcrypt from "bcrypt";
import mongoose from "mongoose";
import router from "../backend/routes/main.router.js";

dotenv.config();


const PORT = process.env.PORT || 3001;
const MONGO_URI = process.env.MONGO_URI;


const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/",router);



mongoose.connect(MONGO_URI)
  .then(() => {
    console.log("✅ MongoDB connected");

    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.log("❌ DB connection error:", err);
  });

  
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import bcrypt from "bcrypt";
import mongoose from "mongoose";
import router from "../backend/routes/main.router.js";
import {createServer} from "node:http";
import {Server} from "socket.io";
import jwt from "jsonwebtoken";

dotenv.config();


const PORT = process.env.PORT || 3001;
const MONGO_URI = process.env.MONGO_URI;


const app = express();
const httpServer = createServer(app);

const corsOptions = {
  origin: process.env.FRONTEND_URL || "http://localhost:3000",
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
};

const io = new Server(httpServer,{
  cors:{
    origin:corsOptions.origin,
    methods:["GET","POST"],
    credentials:true,
  }
});

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/",router);

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;

  if (!token) {
    return next(
      new Error("Authentication required.")
    );
  }

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET_KEY
    );

    socket.user = decoded;

    return next();
  } catch {
    return next(
      new Error("Invalid or expired token.")
    );
  }
});

io.on("connection",(socket) =>{
  const userRoom = `user:${socket.user.id}`;

  socket.join(userRoom);

  console.log("Authenticated socket connected:",socket.id,userRoom);

  socket.on("disconnect", (reason) =>{
    console.log("Socket disconnected: ",socket.id,reason);
  });



});

mongoose.connect(MONGO_URI)
  .then(() => {
    console.log("✅ MongoDB connected");

    httpServer.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.log("❌ DB connection error:", err);
  });

  
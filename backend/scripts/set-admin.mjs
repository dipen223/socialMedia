// Grants or removes admin access. Run it yourself, on a machine that has the
// production .env - it is the only way to change a role:
//   node scripts/set-admin.mjs you@example.com          (make admin)
//   node scripts/set-admin.mjs you@example.com --remove (back to a normal user)
import dotenv from "dotenv";
import mongoose from "mongoose";
import User from "../models/user.model.js";

dotenv.config({ quiet: true });

const [email, flag] = process.argv.slice(2);
if (!email || (flag && flag !== "--remove")) {
    console.error("Usage: node scripts/set-admin.mjs <email> [--remove]");
    process.exit(1);
}

await mongoose.connect(process.env.MONGO_URI);
const role = flag === "--remove" ? "user" : "admin";
// Signup stores the email exactly as typed, so match it case-insensitively.
const result = await User.updateOne(
    { email: email.trim() },
    { $set: { role } },
    { collation: { locale: "en", strength: 2 } }
);

if (result.matchedCount === 0) {
    console.error(`No user found with email ${email}`);
    process.exitCode = 1;
} else {
    console.log(`${email} is now: ${role}`);
}
await mongoose.disconnect();

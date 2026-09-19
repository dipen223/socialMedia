// Standalone sanity check for the Cloudinary URL helpers - pure string ops,
// no network/DB needed. Run with: node backend/scripts/test-cloudinary-video.mjs
import { withVideoDelivery, videoThumbnail } from "../services/cloudinaryVideo.service.js";

let passed = 0;
let failed = 0;
const check = (label, condition) => {
    if (condition) {
        passed += 1;
        console.log(`  ok  - ${label}`);
    } else {
        failed += 1;
        console.error(`  FAIL - ${label}`);
    }
};

const sampleUrl = "https://res.cloudinary.com/drtf2grte/video/upload/v1785421580/ripple/posts/abc/clip.mp4";

console.log("1) withVideoDelivery");
check(
    "inserts f_auto,q_auto right after /upload/",
    withVideoDelivery(sampleUrl) ===
        "https://res.cloudinary.com/drtf2grte/video/upload/f_auto,q_auto/v1785421580/ripple/posts/abc/clip.mp4"
);
check("leaves a non-Cloudinary URL untouched", withVideoDelivery("https://example.com/clip.mp4") === "https://example.com/clip.mp4");
check("doesn't throw on empty/null input", withVideoDelivery("") === "" && withVideoDelivery(null) === null);

console.log("2) videoThumbnail");
check(
    "inserts so_0,q_auto and swaps the extension to .jpg",
    videoThumbnail(sampleUrl) ===
        "https://res.cloudinary.com/drtf2grte/video/upload/so_0,q_auto/v1785421580/ripple/posts/abc/clip.jpg"
);
check(
    "swaps a different extension (.mov) to .jpg too",
    videoThumbnail(sampleUrl.replace(".mp4", ".mov")).endsWith(".jpg")
);
check("returns null for a non-Cloudinary URL (nothing to derive a frame from)", videoThumbnail("https://example.com/clip.mp4") === null);
check("returns null for empty/missing input", videoThumbnail("") === null && videoThumbnail(undefined) === null);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);


const UPLOAD_MARKER = "/upload/";

const insertTransformation = (url, transformation) => {
    if (typeof url !== "string" || !url.includes(UPLOAD_MARKER)) return url;
    return url.replace(UPLOAD_MARKER, `${UPLOAD_MARKER}${transformation}/`);
};


export const withVideoDelivery = (url) => insertTransformation(url, "f_auto,q_auto");


export const videoThumbnail = (url) => {
    const withFrame = insertTransformation(url, "so_0,q_auto");
    if (withFrame === url) return null; // not a Cloudinary /upload/ URL - nothing to derive
    return withFrame.replace(/\.[^./]+$/, ".jpg");
};

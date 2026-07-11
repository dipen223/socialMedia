import Comment from "../models/comments.model.js";
import Post from "../models/posts.model.js";

const commentPost = async (req, res) => {
    const userId = req.user.id;
    const { postId } = req.params;
    const { commentBody } = req.body;
    try {

        const post = await Post.findById(postId);
        if (!post) {
            return res.status(404).json({ message: "Post not found!" });
        }

        const comment = new Comment({
            userId,
            postId,
            body: commentBody
        });

        await comment.save();
        return res.status(200).json({ message: "Comment Added!" });


    } catch (err) {
        console.error("Error commenting to  the post!", err.message);
        return res.status(500).json({ message: "Server error!" });
    }
}
const get_comments_by_post = async (req, res) => {
    const { postId } = req.params;


    try {
        const post = await Post.findById(postId);
        if (!post) {
            return res.status(404).json({ message: "Post not found!" });

        }

        const comments = await Comment.find({ postId })
            .populate("userId", "name username profilePicture")
            .sort({ createdAt: -1 });

        return res.status(200).json({
            count: comments.length,
            comments
        });

    } catch (err) {
        console.error("Error fetching comments by the post!", err.message);
        return res.status(500).json({ message: "Server error!" });
    }
};

const deleteComment = async (req, res) => {
    const userId = req.user.id;
    const { commentId } = req.params;

    try {


        const comment = await Comment.findById(commentId);
        if (!comment) {
            return res.status(404).json({
                message: "Comment not found!"
            });
        }
        if (comment.userId.toString() !== userId) {
            return res.status(403).json({
                message: "You cannot delete this comment"
            });
        }
        return res.status(200).json({
            message: "Comment deleted!"
        });
        await comment.deleteOne();



    } catch (err) {
        console.error("Error deleting the comment!", err.message);
        return res.status(500).json({ message: "Server error!" });
    }
}


export default { commentPost, get_comments_by_post,deleteComment };
import express from "express";
import storyController from "../controllers/story.controller.js";
import auth from "../middlewares/auth.js";

const storyRouter = express.Router();

storyRouter.get("/active", auth, storyController.getActiveStories);
storyRouter.post("/create", auth, storyController.createStory);
storyRouter.post("/:storyId/view", auth, storyController.viewStory);
storyRouter.post("/:storyId/like", auth, storyController.likeStory);
storyRouter.delete("/:storyId", auth, storyController.deleteStory);

export default storyRouter;

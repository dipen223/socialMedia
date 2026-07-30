import { createSlice } from "@reduxjs/toolkit";
import {
    getConversations, getMessages
} from "../../action/chatAction";
import { logout } from "../authReducer";

const initialState = {
    conversations: [],
    messagesByConversation: {},
    paginationByConversation: {},
    isLoadingConversations: false,
    error: "",
    isLoadingMessagesByConversation: {},
};

const chatSlice = createSlice({
    name: "chat",
    initialState,
    reducers: {
        clearChatError: (state) => {
            state.error = "";
        },

        receiveMessage: (state, action) => {
            const message = action.payload?.message || action.payload;
            const conversationSummary = action.payload?.conversation;
            const conversationId = message?.conversationId;

            if (!message?._id || !conversationId) {
                return;
            }

            const existingMessages =
                state.messagesByConversation[
                conversationId
                ] || [];

            const existingIndex =
                existingMessages.findIndex(
                    (item) => item._id === message._id
                );

            if (existingIndex === -1) {
                existingMessages.push(message);
            } else {
                existingMessages[existingIndex] = message;
            }

            state.messagesByConversation[
                conversationId
            ] = existingMessages;

            let conversation =
                state.conversations.find(
                    (item) => item._id === conversationId
                );

            if (!conversation && conversationSummary) {
                state.conversations.unshift(conversationSummary);
                conversation = state.conversations[0];
            }

            if (conversation) {
                if (conversationSummary) {
                    Object.assign(conversation, conversationSummary);
                } else {
                    conversation.lastMessageId = message;
                    conversation.updatedAt = message.createdAt;
                }

                state.conversations.sort(
                    (first, second) =>
                        new Date(second.updatedAt).getTime() -
                        new Date(first.updatedAt).getTime()
                );
            }
        },
        receiveReadReceipt: (state, action) => {
            const { conversationId, readerId, readAt } = action.payload || {};
            if (!conversationId || !readerId || !readAt) return;

            const messages =
                state.messagesByConversation[conversationId] || [];

            messages.forEach((message) => {
                const senderId = message.senderId?._id || message.senderId;
                const alreadyRead = message.readBy?.some(
                    (receipt) => receipt.userId === readerId
                );

                if (senderId !== readerId && !alreadyRead) {
                    message.readBy ||= [];
                    message.readBy.push({ userId: readerId, readAt });
                }
            });
        },
        receiveDeliveryReceipt: (state, action) => {
            const { conversationId, messageId, userId, deliveredAt } =
                action.payload || {};
            const message = (
                state.messagesByConversation[conversationId] || []
            ).find((item) => item._id === messageId);
            if (
                !message ||
                message.deliveredTo?.some(
                    (receipt) => receipt.userId === userId
                )
            ) {
                return;
            }
            message.deliveredTo ||= [];
            message.deliveredTo.push({ userId, deliveredAt });
        },
        updateMessage: (state, action) => {
            const message = action.payload?.message || action.payload;
            const conversationId = message?.conversationId;
            if (!message?._id || !conversationId) return;

            const messages =
                state.messagesByConversation[conversationId] || [];
            const index = messages.findIndex(
                (item) => item._id === message._id
            );
            if (index !== -1) messages[index] = message;

            const conversation = state.conversations.find(
                (item) => item._id === conversationId
            );
            const lastMessageId =
                conversation?.lastMessageId?._id ||
                conversation?.lastMessageId;
            if (conversation && lastMessageId === message._id) {
                conversation.lastMessageId = message;
            }
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(getConversations.pending, (state) => {
                state.isLoadingConversations = true;
                state.error = "";
            })
            .addCase(
                getConversations.fulfilled,
                (state, action) => {
                    state.isLoadingConversations = false;
                    state.conversations =
                        action.payload.conversations || [];
                }
            )
            .addCase(
                getConversations.rejected,
                (state, action) => {
                    state.isLoadingConversations = false;
                    state.error =
                        action.payload ||
                        "Could not retrieve conversations.";
                }
            ).addCase(getMessages.pending, (state, action) => {
                const { conversationId } = action.meta.arg;

                state.isLoadingMessagesByConversation[
                    conversationId
                ] = true;

                state.error = "";
            })
            .addCase(getMessages.fulfilled, (state, action) => {
                const {
                    conversationId,
                    messages = [],
                    isOlderPage,
                    hasMore,
                    nextCursor,
                } = action.payload;

                const existingMessages =
                    state.messagesByConversation[
                    conversationId
                    ] || [];

                const combinedMessages = isOlderPage
                    ? [...messages, ...existingMessages]
                    : messages;

                state.messagesByConversation[
                    conversationId
                ] = Array.from(
                    new Map(
                        combinedMessages.map((message) => [
                            message._id,
                            message,
                        ])
                    ).values()
                );

                state.paginationByConversation[
                    conversationId
                ] = {
                    hasMore,
                    nextCursor,
                };

                state.isLoadingMessagesByConversation[
                    conversationId
                ] = false;
            })
            .addCase(getMessages.rejected, (state, action) => {
                const { conversationId } = action.meta.arg;

                state.isLoadingMessagesByConversation[
                    conversationId
                ] = false;

                state.error =
                    action.payload ||
                    "Could not retrieve messages.";
            })
            .addCase(logout, () => initialState);
    },
});

export const {
    clearChatError,
    receiveMessage,
    receiveReadReceipt,
    receiveDeliveryReceipt,
    updateMessage,
} = chatSlice.actions;

export default chatSlice.reducer;

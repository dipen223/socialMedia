import { createSlice } from "@reduxjs/toolkit";
import {
  sendConnectionRequest,
  getSentRequests,
  getReceivedRequests,
  acceptConnectionRequest,
  deleteConnectionRequest,
  getMyConnections,
} from "../../action/connectionAction";

const initialState = {
  sentRequests: [],
  receivedRequests: [],
  connections: [],

  sendingForUserId: null,
  acceptingRequestId: null,
  deletingRequestId: null,

  isLoadingSent: false,
  isLoadingReceived: false,
  isLoadingConnections: false,

  error: "",
};

const connectionSlice = createSlice({
  name: "connections",
  initialState,
  reducers: {
    clearConnectionError: (state) => {
      state.error = "";
    },
  },
  extraReducers: (builder) => {
    builder

    //send connection req
    .addCase(
        sendConnectionRequest.pending,
        (state, action) => {
          state.sendingForUserId =
            action.meta.arg;

          state.error = "";
        }
      )

      .addCase(
        sendConnectionRequest.fulfilled,
        (state, action) => {
          state.sendingForUserId = null;

          state.sentRequests.unshift(
            action.payload.request
          );
        }
      )

      .addCase(
        sendConnectionRequest.rejected,
        (state, action) => {
          state.sendingForUserId = null;

          state.error =
            action.payload ||
            "Failed to send connection request.";
        }
      )
      // Get sent requests
      .addCase(
        getSentRequests.pending,
        (state) => {
          state.isLoadingSent = true;
          state.error = "";
        }
      )

      .addCase(
        getSentRequests.fulfilled,
        (state, action) => {
          state.isLoadingSent = false;

          state.sentRequests =
            action.payload.requests;
        }
      )

      .addCase(
        getSentRequests.rejected,
        (state, action) => {
          state.isLoadingSent = false;

          state.error =
            action.payload ||
            "Failed to retrieve sent requests.";
        }
      )

      //get received requests
        .addCase(
        getReceivedRequests.pending,
        (state) => {
          state.isLoadingReceived = true;
          state.error = "";
        }
      )

      .addCase(
        getReceivedRequests.fulfilled,
        (state, action) => {
          state.isLoadingReceived = false;

          state.receivedRequests =
            action.payload.requests;
        }
      )

      .addCase(
        getReceivedRequests.rejected,
        (state, action) => {
          state.isLoadingReceived = false;

          state.error =
            action.payload ||
            "Failed to retrieve received requests.";
        }
      )
            // Accept connection request
      .addCase(
        acceptConnectionRequest.pending,
        (state, action) => {
          state.acceptingRequestId =
            action.meta.arg;

          state.error = "";
        }
      )

      .addCase(
        acceptConnectionRequest.fulfilled,
        (state, action) => {
          const acceptedRequestId =
            action.payload.connection._id;

          state.receivedRequests =
            state.receivedRequests.filter(
              (request) =>
                request._id !==
                acceptedRequestId
            );

          state.acceptingRequestId = null;
        }
      )

      .addCase(
        acceptConnectionRequest.rejected,
        (state, action) => {
          state.acceptingRequestId = null;

          state.error =
            action.payload ||
            "Failed to accept connection request.";
        }
      )      // Delete connection request
      .addCase(
        deleteConnectionRequest.pending,
        (state, action) => {
          state.deletingRequestId =
            action.meta.arg;

          state.error = "";
        }
      )

      .addCase(
        deleteConnectionRequest.fulfilled,
        (state, action) => {
          const deletedRequestId =
            action.payload.requestId;

          state.receivedRequests =
            state.receivedRequests.filter(
              (request) =>
                request._id !==
                deletedRequestId
            );

          state.deletingRequestId = null;
        }
      )

      .addCase(
        deleteConnectionRequest.rejected,
        (state, action) => {
          state.deletingRequestId = null;

          state.error =
            action.payload ||
            "Failed to delete connection request.";
        }
      )

      // Get accepted connections
      .addCase(
        getMyConnections.pending,
        (state) => {
          state.isLoadingConnections = true;
          state.error = "";
        }
      )

      .addCase(
        getMyConnections.fulfilled,
        (state, action) => {
          state.isLoadingConnections = false;

          state.connections =
            action.payload.connections;
        }
      )

      .addCase(
        getMyConnections.rejected,
        (state, action) => {
          state.isLoadingConnections = false;

          state.error =
            action.payload ||
            "Failed to retrieve connections.";
        }
      );


  },
});

export const {
  clearConnectionError,
} = connectionSlice.actions;

export default connectionSlice.reducer;
import { createAsyncThunk } from "@reduxjs/toolkit";
import { clientServer } from "@/config";

export const sendConnectionRequest = createAsyncThunk(
  "connections/sendRequest",
  async (recipientId, thunkAPI) => {
    try {
      const response = await clientServer.post(
        "/connection-requests",
        {
          recipientId,
        }
      );

      return response.data;
    } catch (err) {
      return thunkAPI.rejectWithValue(
        err.response?.data?.message ||
        err.message ||
        "Failed to send a connection request."
      );
    }
  }
); 


export const getSentRequests = createAsyncThunk("connections/getSentRequests",
  async(_,thunkAPI) =>{

    try{
         const response = await clientServer.get("connection-requests/sent");

    return response.data;

    }catch(err){
        return thunkAPI.rejectWithValue(
        err.response?.data?.message ||
        err.message ||
        "Failed to retrieve sent connection request."
      );

    }
 
  }

);
export const getReceivedRequests = createAsyncThunk("connections/getReceivedRequests",
  async(_,thunkAPI) =>{

    try{
         const response = await clientServer.get("/connection-requests/received");

    return response.data;

    }catch(err){
        return thunkAPI.rejectWithValue(
        err.response?.data?.message ||
        err.message ||
        "Failed to retrieve received connection request."
      );

    }
 
  }

);



export const acceptConnectionRequest = createAsyncThunk("connections/acceptConnectionRequest", async(requestId,thunkAPI) =>{

  try{
    const response = await clientServer.patch(`/connection-requests/${requestId}/accept`);
    return response.data;

    
  }catch(err){
    return thunkAPI.rejectWithValue(
      err.response?.data?.message || 
      err.message || "Failed to accept connection request!"
    );
  }

});


export const deleteConnectionRequest  = createAsyncThunk("connections/deleteConnectionRequest", async(requestId,thunkAPI) =>{
  try{

    const response = await clientServer.delete(`/connection-requests/${requestId}`);

    return  response.data;

  }catch(err){
     return thunkAPI.rejectWithValue(
      err.response?.data?.message || 
      err.message || "Failed to delete connection request!"
    );

  }
});

export const getMyConnections = createAsyncThunk("connections/getMyConnections",async(_,thunkAPI) => {
  try{
    const response = await clientServer.get("/connections");

    return response.data;

  }catch(err){

     return thunkAPI.rejectWithValue(
      err.response?.data?.message || 
      err.message || "Failed to retrieve connections!"
    );

  }
})
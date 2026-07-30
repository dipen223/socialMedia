import { io } from "socket.io-client";

const SOCKET_URL = process.env.NEXT_PUBLIC_API_URL  || "http://localhost:3001";

let socketInstance = null;


export const getSocket = () =>{
    if(typeof window === "undefined"){
        return null;
    }

    if(!socketInstance){
        socketInstance = io(SOCKET_URL,{
            autoConnect:false,
        });
    }

    return socketInstance;
};
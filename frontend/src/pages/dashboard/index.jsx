import { useRouter } from 'next/router';
import React, { useState, useEffect } from 'react';
import { clientServer } from "@/config/index.jsx";

const Dashboard = () => {
    const router = useRouter();
    const [checkingAuth, setCheckingAuth] = useState(true);

    useEffect(() => {
        const verifyUser = async () => {
            const token = localStorage.getItem("token");
            if (!token) {
                router.push("/login");
            }

            try {
                await clientServer.get("/profile",{
                    headers:{
                        Authorization:`Bearer ${token}`,
                    },
                });

                setCheckingAuth(false);

            } catch (error) {
                localStorage.removeItem("token");
                router.replace("/login");
            }


        };
        verifyUser();

    }, [router]);

    if(checkingAuth){
        return <div>Checking Authentication....</div>
    }


    return (
        <div>Dashboard</div>
    )
}

export default Dashboard;
import { useRouter } from 'next/router';
import React, { useState, useEffect } from 'react';

import { useDispatch } from 'react-redux';
import { getUserProfile } from "@/config/redux/action/authAction";
import { getAllPosts } from '@/config/redux/action/postAction';

const Dashboard = () => {
    const router = useRouter();
    const dispatch = useDispatch();
    const [checkingAuth, setCheckingAuth] = useState(true);


    useEffect(() => {
        const verifyUser = async () => {
            const token = localStorage.getItem("token");
            if (!token) {
                router.push("/login");
                return;
            }


            try {
                await dispatch(getUserProfile()).unwrap();
                await dispatch(getAllPosts()).unwrap();
                setCheckingAuth(false);
            } catch {
                localStorage.removeItem("token");
                router.replace("/login");
            }
        };
        verifyUser();

    }, [dispatch,router]);



    if (checkingAuth) {
        return <div>Checking Authentication....</div>
    }


    return (
        <div>Dashboard</div>
    )
}

export default Dashboard;
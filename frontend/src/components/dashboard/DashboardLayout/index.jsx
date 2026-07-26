import Navbar from "@/components/dashboard/Navbar";
import Sidebar from "@/components/dashboard/Sidebar";
import useDashboardAuth from "@/hooks/useDashboardAuth";
import styles from "./DashboardLayout.module.css";
import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";

import {
  getSentRequests,
  getReceivedRequests,
  getMyConnections,
} from "@/config/redux/action/connectionAction";
import { getNotifications } from "@/config/redux/action/notificationAction";

export default function DashboardLayout({ children }) {
  const checkingAuth = useDashboardAuth();

  const dispatch = useDispatch();
  const {
    hasFetchedSent,
    hasFetchedReceived,
    hasFetchedConnections,
    isLoadingSent,
    isLoadingReceived,
    isLoadingConnections,
  } = useSelector((state) => state.connections);
  const { hasFetched: hasFetchedNotifications, isLoading: isLoadingNotifications } =
    useSelector((state) => state.notifications);

  useEffect(() => {
    if (checkingAuth) return;

    if (!hasFetchedSent && !isLoadingSent) {
      dispatch(getSentRequests());
    }

    if (!hasFetchedReceived && !isLoadingReceived) {
      dispatch(getReceivedRequests());
    }

    if (!hasFetchedConnections && !isLoadingConnections) {
      dispatch(getMyConnections());
    }

    if (!hasFetchedNotifications && !isLoadingNotifications) {
      dispatch(getNotifications());
    }
  }, [
    checkingAuth,
    dispatch,
    hasFetchedConnections,
    hasFetchedReceived,
    hasFetchedSent,
    isLoadingConnections,
    hasFetchedNotifications,
    isLoadingNotifications,
    isLoadingReceived,
    isLoadingSent,
  ]);

  useEffect(() => {
    if (checkingAuth) return undefined;

    const intervalId = window.setInterval(() => {
      dispatch(getNotifications());
    }, 60000);

    return () => window.clearInterval(intervalId);
  }, [checkingAuth, dispatch]);

  if (checkingAuth) {
    return <div className={styles.checking}>Checking authentication...</div>;
  }

  return (
    <>
      <Navbar />
      <main className={styles.layout}>
        <Sidebar />
        <div className={styles.centerColumn}>{children}</div>
      </main>
    </>
  );
}

import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useDispatch, useSelector } from "react-redux";
import { getUserProfile } from "@/config/redux/action/authAction";
import { logout } from "@/config/redux/reducer/authReducer";

export default function useDashboardAuth() {
  const router = useRouter();
  const dispatch = useDispatch();
  const user = useSelector((state) => state.auth.user);
  const [checkingAuth, setCheckingAuth] = useState(!user);

  useEffect(() => {
    const verifyUser = async () => {
      const token = localStorage.getItem("token");

      if (!token) {
        router.replace("/login");
        return;
      }

      if (user) {
        setCheckingAuth(false);
        return;
      }

      try {
        await dispatch(getUserProfile()).unwrap();
        setCheckingAuth(false);
      } catch {
        dispatch(logout());
        router.replace("/login?reason=session-expired");
      }
    };

    verifyUser();
  }, [dispatch, router, user]);

  return checkingAuth;
}

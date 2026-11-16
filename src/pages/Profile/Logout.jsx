import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axiosInstance from "../../components/AxiosInstance";
import { clearAuthSession } from "../../utils/authSession";

const Logout = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const performLogout = async () => {
      try {
        await axiosInstance.post("/auth/logout", {}, { withCredentials: true });
      } catch {
        // Proceed with client-side cleanup even if the server call fails
      } finally {
        // Clears this tab's session only — see utils/authSession.js.
        clearAuthSession();
        navigate("/login", { replace: true });
      }
    };

    performLogout();
  }, [navigate]);

  return null;
};

export default Logout;

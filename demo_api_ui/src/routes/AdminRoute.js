import { useEffect } from "react";
import { Navigate } from "react-router-dom";
import { notifyWarning } from "../utils/appToast";

let _accessDeniedToasted = false;

export default function AdminRoute({ user, children }) {
  const isAdmin = user?.role === "admin";

  useEffect(() => {
    if (!isAdmin && !_accessDeniedToasted) {
      _accessDeniedToasted = true;
      notifyWarning("This page is restricted to admin users.");
    }
    if (isAdmin) {
      _accessDeniedToasted = false;
    }
  }, [isAdmin]);

  if (isAdmin) return children;
  return <Navigate to="/" replace />;
}

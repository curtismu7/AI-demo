import { useEffect, useRef } from "react";
import { Navigate } from "react-router-dom";
import { notifyWarning } from "../utils/appToast";

export default function AdminRoute({ user, children }) {
  const toastedRef = useRef(false);
  const isAdmin = user?.role === "admin";

  useEffect(() => {
    if (!isAdmin && !toastedRef.current) {
      toastedRef.current = true;
      notifyWarning("This page is restricted to admin users.");
    }
  }, [isAdmin]);

  if (isAdmin) return children;
  return <Navigate to="/" replace />;
}

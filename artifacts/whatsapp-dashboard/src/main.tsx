import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { useAppStore } from "@/store";

setAuthTokenGetter(() => {
  const token = useAppStore.getState().token;
  if (!token || token === "cookie-auth") return null;
  return token;
});

createRoot(document.getElementById("root")!).render(<App />);

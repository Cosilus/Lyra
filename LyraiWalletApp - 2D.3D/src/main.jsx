import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import LogoSplash from "./three-d/LogoSplash.jsx";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
    <LogoSplash />
  </React.StrictMode>
);
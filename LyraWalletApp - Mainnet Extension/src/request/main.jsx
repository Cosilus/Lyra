import React from "react";
import { createRoot } from "react-dom/client";
import RequestApp from "./RequestApp.jsx";
import { syncNetworks } from "../providerSync.js";
import { startFadeScroll } from "../fadeScroll.js";
import "../styles.css";
import "./request.css";

syncNetworks();
startFadeScroll();

createRoot(document.getElementById("root")).render(
  <React.StrictMode><RequestApp /></React.StrictMode>
);

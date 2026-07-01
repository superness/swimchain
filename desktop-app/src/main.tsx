import React from "react";
import ReactDOM from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import App from "./App";
import "./styles.css";

// Log IMMEDIATELY before anything else - include HOW the app is running
const startupLog = async () => {
  const timestamp = new Date().toISOString();
  const info = {
    timestamp,
    href: window.location.href,
    origin: window.location.origin,
    pathname: window.location.pathname,
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    isDevMode: import.meta.env.DEV,
    mode: import.meta.env.MODE,
    baseUrl: import.meta.env.BASE_URL,
  };
  try {
    await invoke("write_client_log", {
      client: "desktop-app",
      level: "info",
      message: `===== DESKTOP APP STARTED ===== ${JSON.stringify(info)}`,
    });
  } catch (e) {
    // Can't log - write to console as fallback
    console.error("CRITICAL: Cannot write logs!", e);
  }
};
startupLog();

// Global error handler - catches uncaught errors
window.onerror = (message, source, lineno, colno, error) => {
  invoke("write_client_log", {
    client: "desktop-app",
    level: "error",
    message: `UNCAUGHT ERROR: ${message} at ${source}:${lineno}:${colno} - ${error?.stack || "no stack"}`,
  }).catch(() => {});
};

// Unhandled promise rejection handler
window.onunhandledrejection = (event) => {
  invoke("write_client_log", {
    client: "desktop-app",
    level: "error",
    message: `UNHANDLED REJECTION: ${event.reason}`,
  }).catch(() => {});
};

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

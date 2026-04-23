import React, { useEffect, useState } from "react";
import { Toaster } from "react-hot-toast";
import { Routes, Route, Navigate } from "react-router-dom";
import "./App.css";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import QuotePublicPreview from "./pages/QuotePublicPreview";

export default function App() {
  const [worker, setWorker] = useState(null);

  useEffect(() => {
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }
  }, []);

  useEffect(() => {
    const raw = localStorage.getItem("worker");
    if (raw) setWorker(JSON.parse(raw));
  }, []);

  if (!worker) {
    return (
      <Routes>
        <Route path="/cotizacion/:token" element={<QuotePublicPreview />} />
        <Route path="*" element={<Login onLogin={(w) => setWorker(w)} />} />
      </Routes>
    );
  }

  const dashboardElement = (
    <Dashboard
      worker={worker}
      onLogout={() => {
        localStorage.removeItem("worker");
        setWorker(null);
      }}
    />
  );

return (
    <>
      <Toaster
        position="top-center"
        toastOptions={{
          duration: 5000,
          style: {
            maxWidth: "420px",
            borderRadius: "14px",
            padding: "12px 16px",
            fontSize: "14px",
            fontWeight: 600,
            boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
          },
        }}
      />
      <Routes>
        <Route path="/" element={dashboardElement} />
      <Route path="/admin" element={dashboardElement} />
      <Route path="/forms" element={dashboardElement} />
      <Route path="/forms/:formId" element={dashboardElement} />
      <Route path="/inventory" element={dashboardElement} />
      <Route path="/clients" element={dashboardElement} />
      <Route path="/quotes" element={dashboardElement} />
      <Route path="/operations" element={dashboardElement} />
      <Route path="/invoices" element={dashboardElement} />
      <Route path="/service-sheets" element={dashboardElement} />
      <Route path="/weekly-reports" element={dashboardElement} />
      <Route path="/general-reports" element={dashboardElement} />
      <Route path="/calendar" element={dashboardElement} />
      <Route path="/cotizacion/:token" element={<QuotePublicPreview />} />
<Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  );
}
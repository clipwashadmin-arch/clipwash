import React, { useCallback, useEffect, useMemo, useState } from "react";
import "./App.css";
import logo from "./clipwash-logo.png";

const API_BASE = "https://clipwash.onrender.com";

function App() {
  const [status, setStatus] = useState("");

  const getClientId = () => {
    let id = localStorage.getItem("clipwash_client_id");
    if (!id) {
      id = "cw_" + Math.random().toString(36).slice(2);
      localStorage.setItem("clipwash_client_id", id);
    }
    return id;
  };

  const handleUpgrade = async () => {
    const clientId = getClientId();

    try {
      setStatus("Connecting to payment...");

      const response = await fetch(
        `${API_BASE}/create-checkout-session?client_id=${clientId}`,
        {
          method: "POST",
        }
      );

      const data = await response.json();

      if (data.success && data.url) {
        window.location.href = data.url;
      } else {
        setStatus("Error: " + (data.error || "Unknown error"));
      }
    } catch (err) {
      console.error("FETCH ERROR:", err);
      setStatus("Payment connection failed.");
    }
  };

  return (
    <div style={{ padding: 40 }}>
      <h1>ClipWash Test</h1>
      <button onClick={handleUpgrade}>
        Upgrade to Pro
      </button>
      <p>{status}</p>
    </div>
  );
}

export default App;
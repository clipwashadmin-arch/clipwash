import React, { useCallback, useEffect, useMemo, useState } from "react";
import "./App.css";
import logo from "./clipwash-logo.png";

const API_BASE = "https://clipwash.onrender.com";

function App() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [status, setStatus] = useState("No file selected");
  const [step, setStep] = useState("");
  const [downloadUrl, setDownloadUrl] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [usage, setUsage] = useState({
    paid: false,
    daily_count: 0,
    daily_limit: 3,
    max_duration_seconds: 60,
  });

  const steps = useMemo(
    () => [
      "Uploading",
      "Extracting Audio",
      "Detecting Profanity",
      "Applying Bleeps",
      "Finalizing Video",
    ],
    []
  );

  const currentStepIndex = steps.indexOf(step);

  const getClientId = useCallback(() => {
    let clientId = localStorage.getItem("clipwash_client_id");
    if (!clientId) {
      clientId =
        "cw_" +
        Math.random().toString(36).slice(2) +
        Date.now().toString(36);
      localStorage.setItem("clipwash_client_id", clientId);
    }
    return clientId;
  }, []);

  const fetchPlanStatus = useCallback(async () => {
    const clientId = getClientId();

    try {
      const response = await fetch(
        `${API_BASE}/plan-status?client_id=${encodeURIComponent(clientId)}`
      );
      const data = await response.json();

      if (data.success) {
        setUsage({
          paid: data.paid ?? false,
          daily_count: data.daily_count ?? 0,
          daily_limit: data.daily_limit ?? 3,
          max_duration_seconds: data.max_duration_seconds ?? 60,
        });
      }
    } catch (e) {
      console.error("Failed to fetch plan status", e);
    }
  }, [getClientId]);

  useEffect(() => {
    fetchPlanStatus();
  }, [fetchPlanStatus]);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    setSelectedFile(file);
    setDownloadUrl("");
    setStep("");
    setStatus(file ? `Selected: ${file.name}` : "No file selected");
  };

  const handleUpgrade = async () => {
    const clientId = getClientId();

    try {
      const response = await fetch(
        `${API_BASE}/create-checkout-session?client_id=${encodeURIComponent(clientId)}`,
        { method: "POST" }
      );

      const data = await response.json();

      if (data.success && data.url) {
        window.location.href = data.url;
      } else {
        setStatus(data.error || "Could not start checkout.");
      }
    } catch (err) {
      console.error(err);
      setStatus("Payment connection failed.");
    }
  };

  const handleCleanVideo = async () => {
    if (!selectedFile) {
      setStatus("Select a video first");
      return;
    }

    const clientId = getClientId();

    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      setIsProcessing(true);
      setDownloadUrl("");

      setStep(steps[0]);
      setStatus("Uploading your clip...");

      const upload = await fetch(
        `${API_BASE}/upload?client_id=${encodeURIComponent(clientId)}`,
        {
          method: "POST",
          body: formData,
        }
      );

      const uploadData = await upload.json();

      if (!uploadData.success) {
        setStatus(uploadData.error || "Upload failed");
        setIsProcessing(false);
        await fetchPlanStatus();
        return;
      }

      const video = uploadData.filename;

      setStep(steps[1]);
      setStatus("Extracting audio...");

      const extract = await fetch(
        `${API_BASE}/extract-audio?filename=${encodeURIComponent(video)}`,
        { method: "POST" }
      );

      const extractData = await extract.json();

      if (!extractData.success) {
        setStatus("Audio extraction failed");
        setIsProcessing(false);
        return;
      }

      const audio = extractData.audio_filename;

      setStep(steps[2]);
      setStatus("Detecting profanity...");

      const censor = await fetch(
        `${API_BASE}/censor-audio?filename=${encodeURIComponent(audio)}`,
        { method: "POST" }
      );

      const censorData = await censor.json();

      if (!censorData.success) {
        setStatus("Audio censoring failed");
        setIsProcessing(false);
        return;
      }

      if (!censorData.censored_audio) {
        setStatus("No profanity detected.");
        setIsProcessing(false);
        return;
      }

      const censoredAudio = censorData.censored_audio;

      setStep(steps[3]);
      setStatus("Applying bleeps...");

      setStep(steps[4]);
      setStatus("Finalizing video...");

      const merge = await fetch(
        `${API_BASE}/merge-video-audio?video_filename=${encodeURIComponent(
          video
        )}&censored_audio_filename=${encodeURIComponent(
          censoredAudio
        )}&client_id=${encodeURIComponent(clientId)}`,
        { method: "POST" }
      );

      const mergeData = await merge.json();

      if (!mergeData.success) {
        setStatus(mergeData.error || "Video finalization failed");
        setIsProcessing(false);
        await fetchPlanStatus();
        return;
      }

      const output = mergeData.output;
      const url = `${API_BASE}/download/${encodeURIComponent(output)}`;

      setDownloadUrl(url);
      setStatus(
        mergeData.paid
          ? "Your Pro cleaned video is ready."
          : "Your cleaned video is ready."
      );
      setIsProcessing(false);

      await fetchPlanStatus();
    } catch (err) {
      console.error(err);
      setStatus("Something broke during processing.");
      setIsProcessing(false);
    }
  };

  return (
    <div className="page-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <main className="app-shell">
        <section className="hero-card">
          <div className="hero-left">
            <div className="brand-lockup">
              <img src={logo} alt="ClipWash logo" className="brand-logo" />
              <div>
                <h1 className="brand-title">ClipWash</h1>
                <p className="brand-tag">
                  Automatic profanity bleeping for creators
                </p>
              </div>
            </div>

            <div className="copy-block">
              <h2 className="headline">
                Clean your clips in minutes, not timelines.
              </h2>
              <p className="subcopy">
                Upload a video, automatically detect profanity, apply bleeps,
                and get a clean version ready to post instantly.
              </p>
            </div>

            <div className="feature-row">
              <div className="feature-pill">Fast processing</div>
              <div className="feature-pill">Automatic detection</div>
              <div className="feature-pill">Ready-to-post output</div>
            </div>
          </div>

          <div className="hero-right">
            <div className="upload-card">
              <p className="eyebrow">Start a wash</p>
              <h3 className="panel-title">Upload a video</h3>
              <p className="panel-copy">
                {usage.paid
                  ? "Pro plan active: no watermark, no free-plan limits."
                  : "Free plan includes watermark, 3 videos/day, and up to 60 seconds."}
              </p>

              <div className="status-panel" style={{ marginBottom: "16px" }}>
                <p className="status-label">Plan</p>
                <p className="status-text">
                  {usage.paid
                    ? "ClipWash Pro active"
                    : `Free: ${usage.daily_count}/${usage.daily_limit} used today • max ${usage.max_duration_seconds}s`}
                </p>
              </div>

              {!usage.paid && (
                <button
                  className="primary-button"
                  onClick={handleUpgrade}
                  style={{ marginBottom: "12px" }}
                >
                  Upgrade to Pro
                </button>
              )}

              <input
                type="file"
                accept="video/*"
                onChange={handleFileChange}
                className="file-input"
              />

              <div className="selected-file">
                {selectedFile ? selectedFile.name : "No file selected"}
              </div>

              <button
                className="primary-button"
                onClick={handleCleanVideo}
                disabled={isProcessing}
              >
                {isProcessing ? "Processing..." : "Clean Video"}
              </button>

              <div className="status-panel">
                <p className="status-label">Status</p>
                <p className="status-text">{status}</p>
              </div>

              <div className="step-list">
                {steps.map((item, index) => {
                  const state =
                    step === item
                      ? "active"
                      : currentStepIndex > index
                      ? "complete"
                      : "";

                  return (
                    <div key={item} className={`step-item ${state}`}>
                      <span className="step-dot" />
                      <span>{item}</span>
                    </div>
                  );
                })}
              </div>

              {downloadUrl && (
                <a href={downloadUrl} download className="download-button">
                  Download Cleaned Video
                </a>
              )}

              <p className="fine-print">
                Built for creators who want faster, cleaner uploads.
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
import React, { useEffect, useMemo, useState } from "react";
import "./App.css";
import logo from "./clipwash-logo.png";

function App() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [status, setStatus] = useState("No file selected");
  const [step, setStep] = useState("");
  const [downloadUrl, setDownloadUrl] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [plan, setPlan] = useState("free");
  const [usage, setUsage] = useState({
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

  // ===== CLIENT ID =====
  const getClientId = () => {
    let clientId = localStorage.getItem("clipwash_client_id");
    if (!clientId) {
      clientId =
        "cw_" +
        Math.random().toString(36).slice(2) +
        Date.now().toString(36);
      localStorage.setItem("clipwash_client_id", clientId);
    }
    return clientId;
  };

  // ===== FETCH PLAN STATUS =====
  const fetchPlanStatus = async () => {
    const clientId = getClientId();
    const paid = plan === "paid";

    try {
      const response = await fetch(
        `http://localhost:8000/plan-status?client_id=${encodeURIComponent(
          clientId
        )}&paid=${paid}`
      );
      const data = await response.json();

      if (data.success) {
        setUsage({
          daily_count: data.daily_count ?? 0,
          daily_limit: data.daily_limit ?? 3,
          max_duration_seconds: data.max_duration_seconds ?? 60,
        });
      }
    } catch (e) {
      console.error("Failed to fetch plan status");
    }
  };

  useEffect(() => {
    fetchPlanStatus();
  }, [plan]);

  // ===== FILE SELECT =====
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    setSelectedFile(file);
    setDownloadUrl("");
    setStep("");
    setStatus(file ? `Selected: ${file.name}` : "No file selected");
  };

  // ===== MAIN PIPELINE =====
  const handleCleanVideo = async () => {
    if (!selectedFile) {
      setStatus("Select a video first");
      return;
    }

    const clientId = getClientId();
    const paid = plan === "paid";

    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      setIsProcessing(true);
      setDownloadUrl("");

      // ===== UPLOAD =====
      setStep(steps[0]);
      setStatus("Uploading your clip...");

      const upload = await fetch(
        `http://localhost:8000/upload?client_id=${encodeURIComponent(
          clientId
        )}&paid=${paid}`,
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

      // ===== EXTRACT AUDIO =====
      setStep(steps[1]);
      setStatus("Extracting audio...");

      const extract = await fetch(
        `http://localhost:8000/extract-audio?filename=${encodeURIComponent(
          video
        )}`,
        { method: "POST" }
      );

      const extractData = await extract.json();

      if (!extractData.success) {
        setStatus("Audio extraction failed");
        setIsProcessing(false);
        return;
      }

      const audio = extractData.audio_filename;

      // ===== CENSOR =====
      setStep(steps[2]);
      setStatus("Detecting profanity...");

      const censor = await fetch(
        `http://localhost:8000/censor-audio?filename=${encodeURIComponent(
          audio
        )}`,
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

      // ===== MERGE =====
      setStep(steps[3]);
      setStatus("Applying bleeps...");

      setStep(steps[4]);
      setStatus("Finalizing video...");

      const merge = await fetch(
        `http://localhost:8000/merge-video-audio?video_filename=${encodeURIComponent(
          video
        )}&censored_audio_filename=${encodeURIComponent(
          censoredAudio
        )}&client_id=${encodeURIComponent(clientId)}&paid=${paid}`,
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

      const url = `http://localhost:8000/download/${encodeURIComponent(
        output
      )}`;

      setDownloadUrl(url);
      setStatus("Your cleaned video is ready.");
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
          {/* LEFT SIDE */}
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

          {/* RIGHT SIDE */}
          <div className="hero-right">
            <div className="upload-card">
              <p className="eyebrow">Start a wash</p>
              <h3 className="panel-title">Upload a video</h3>
              <p className="panel-copy">
                Free plan includes watermark, 3 videos/day, and up to 60 seconds.
              </p>

              {/* PLAN TOGGLE */}
              <div style={{ display: "flex", gap: "10px", marginBottom: "16px" }}>
                <button
                  className={`plan-toggle ${
                    plan === "free" ? "plan-active" : ""
                  }`}
                  onClick={() => setPlan("free")}
                  type="button"
                >
                  Free
                </button>

                <button
                  className={`plan-toggle ${
                    plan === "paid" ? "plan-active" : ""
                  }`}
                  onClick={() => setPlan("paid")}
                  type="button"
                >
                  Paid Preview
                </button>
              </div>

              {/* PLAN STATUS */}
              <div className="status-panel" style={{ marginBottom: "16px" }}>
                <p className="status-label">Plan</p>
                <p className="status-text">
                  {plan === "paid"
                    ? "Paid preview: no watermark, no limits"
                    : `Free: ${usage.daily_count}/${usage.daily_limit} used today • max ${usage.max_duration_seconds}s`}
                </p>
              </div>

              {/* FILE INPUT */}
              <input
                type="file"
                accept="video/*"
                onChange={handleFileChange}
                className="file-input"
              />

              <div className="selected-file">
                {selectedFile ? selectedFile.name : "No file selected"}
              </div>

              {/* BUTTON */}
              <button
                className="primary-button"
                onClick={handleCleanVideo}
                disabled={isProcessing}
              >
                {isProcessing ? "Processing..." : "Clean Video"}
              </button>

              {/* STATUS */}
              <div className="status-panel">
                <p className="status-label">Status</p>
                <p className="status-text">{status}</p>
              </div>

              {/* STEPS */}
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

              {/* DOWNLOAD */}
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
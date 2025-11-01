import React, { useState, useEffect } from "react"
import DarkVeil from "../components/DarkVeil"
import logo from "../assets/icon.png"
import {
  AvailabilityStatus,
  checkAvailabilityStatus,
  downloadModel
} from "../utils/summarizer"
import {
  ArrowRight,
  ArrowLeft,
  CheckCircle,
  Download,
  RotateCcw
} from "lucide-react"

const loadFont = () => {
  const link = document.createElement("link")
  link.href =
    "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
  link.rel = "stylesheet"
  document.head.appendChild(link)
}

const UI_COLORS = {
  background: "radial-gradient(circle at 20% 20%, #0d1117, #080a0d 75%)",
  surface: "rgba(255, 255, 255, 0.15)",
  textHighEmphasis: "#F9FAFB",
  textLowEmphasis: "#AEB8C4",
  primaryAccent: "#2563EB",
  buttonFinish: "#10B981"
}

const FONT_FAMILY = "'Inter', 'Plus Jakarta Sans', 'SF Pro Display', sans-serif"

export default function OnboardingPage({ onClose }) {
  const [currentStep, setCurrentStep] = useState(1)
  const [status, setStatus] = useState<AvailabilityStatus | null>(null)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => loadFont(), [])

  const goToNextStep = async () => {
    if (currentStep === 1) {
      setCurrentStep(2)
      await checkSummarizerStatus()
    }
  }

  const goToPreviousStep = () => setCurrentStep(currentStep - 1)

  const handleFinish = () => {
    if (onClose) onClose()
  }

  const checkSummarizerStatus = async () => {
    try {
      const avail = await checkAvailabilityStatus()
      setStatus(avail)
    } catch (err: any) {
      setError(err.message)
    }
  }

  const handleDownload = async () => {
    try {
      setStatus(AvailabilityStatus.DOWNLOADING)
      await downloadModel((loaded) => {
        const pct = Math.min(100, Math.floor(loaded * 100))
        setProgress(pct)
      })
      setStatus(AvailabilityStatus.AVAILABLE)
    } catch (err: any) {
      setError(err.message)
      setStatus(AvailabilityStatus.UNAVAILABLE)
    }
  }

  const getButtonStyle = (isPrimary: boolean) => ({
    padding: "14px 28px",
    background: "#4f378a",
    color: "#fff",
    border: "none",
    borderRadius: "14px",
    cursor: "pointer",
    fontWeight: 600,
    fontSize: "1.1em",
    letterSpacing: "-0.01em",
    transition: "all 0.25s ease",
    display: "flex",
    alignItems: "center",
    gap: "10px",
    justifyContent: "center",
    boxShadow: isPrimary
      ? "0 3px 8px rgba(37,99,235,0.3)"
      : "0 3px 8px rgba(0,0,0,0.25)"
  })

  const textBase = {
    color: UI_COLORS.textLowEmphasis,
    lineHeight: 1.8,
    fontSize: "1.25em",
    fontWeight: 400
  }

  const renderStepContent = () => {
    if (currentStep === 1) {
      return (
        <div style={{ textAlign: "left", animation: "fadeIn 0.4s ease" }}>
          <h3
            style={{
              marginBottom: 18,
              color: UI_COLORS.textHighEmphasis,
              fontSize: "2.4em",
              fontWeight: 800,
              letterSpacing: "-0.03em"
            }}>
            Welcome to Aether
          </h3>
          <p style={textBase}>
            You’re accessing <b>Aether</b> — your personal AI memory layer.
            Seamlessly store, retrieve, and evolve your prompts across platforms
            with privacy and intelligence.
          </p>
          <div style={{ marginTop: 44, textAlign: "right" }}>
            <button
              onClick={goToNextStep}
              style={getButtonStyle(true)}
              onMouseOver={(e) => (e.currentTarget.style.opacity = "0.85")}
              onMouseOut={(e) => (e.currentTarget.style.opacity = "1")}>
              Continue <ArrowRight size={20} />
            </button>
          </div>
        </div>
      )
    }

    if (currentStep === 2) {
      return (
        <div style={{ textAlign: "left", animation: "fadeIn 0.4s ease" }}>
          <h3
            style={{
              marginBottom: 18,
              color: UI_COLORS.textHighEmphasis,
              fontSize: "2.4em",
              fontWeight: 800,
              letterSpacing: "-0.03em"
            }}>
            Summarizer Setup
          </h3>

          {error && (
            <p style={{ color: "#f87171", fontSize: "1.1em" }}>{error}</p>
          )}

          {status === null && (
            <p style={textBase}>Checking Summarizer API support...</p>
          )}

          {status === AvailabilityStatus.UNAVAILABLE && (
            <>
              <p style={textBase}>
                Summarizer API is unavailable in this browser.
              </p>
              <button
                onClick={checkSummarizerStatus}
                style={{ ...getButtonStyle(true), marginTop: 28 }}>
                <RotateCcw size={20} /> Retry
              </button>
            </>
          )}

          {status === AvailabilityStatus.DOWNLOADABLE && (
            <>
              <p style={textBase}>Model available for download.</p>
              <button
                onClick={handleDownload}
                style={{ ...getButtonStyle(true), marginTop: 28 }}>
                <Download size={20} /> Download Model
              </button>
            </>
          )}

          {status === AvailabilityStatus.DOWNLOADING && (
            <div style={{ marginTop: 24 }}>
              <p style={textBase}>Downloading model...</p>
              <div
                style={{
                  width: "100%",
                  height: 10,
                  background: "rgba(255,255,255,0.15)",
                  borderRadius: 10,
                  overflow: "hidden",
                  marginTop: 12
                }}>
                <div
                  style={{
                    width: `${progress}%`,
                    height: "100%",
                    background: UI_COLORS.primaryAccent,
                    transition: "width 0.25s ease"
                  }}
                />
              </div>
              <p style={{ marginTop: 10, fontSize: "1.1em", color: "#fff" }}>
                {progress.toFixed(1)}%
              </p>
            </div>
          )}

          {status === AvailabilityStatus.AVAILABLE && (
            <>
              <p style={{ ...textBase, color: "#10B981" }}>
                Summarizer model is ready to use.
              </p>
              <div
                style={{
                  marginTop: 44,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center"
                }}>
                <button
                  onClick={goToPreviousStep}
                  style={getButtonStyle(false)}>
                  <ArrowLeft size={20} /> Back
                </button>
                <button
                  onClick={handleFinish}
                  style={{
                    ...getButtonStyle(true),
                    background: '#a575fe',
                    color: "#fff"
                  }}>
                    <a href="https://gemini.google.com" style={{ textDecoration: 'none', color: 'inherit' }}>
                    <div style={{ display: "flex", justifyContent: "center", alignItems: "center"}}>
                        <CheckCircle size={20} style={{marginRight: "10px"}} /> Launch Aether
                    </div>
                    </a>
                </button>
              </div>
            </>
          )}
        </div>
      )
    }
  }

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        position: "fixed",
        top: 0,
        left: 0,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        background: UI_COLORS.background,
        fontFamily: FONT_FAMILY
      }}>
      <div style={{ position: "absolute", inset: 0, zIndex: 500 }}>
        <DarkVeil />
      </div>

      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 18,
          marginBottom: 40,
          zIndex: 1001,
          animation: "fadeInUp 0.6s ease"
        }}>
        <img
          src={logo}
          alt="Aether Logo"
          style={{
            width: 60,
            height: 60,
            filter: "drop-shadow(0 3px 8px rgba(37,99,235,0.5))"
          }}
        />
        <h1
          style={{
            color: "#FFFFFF",
            fontSize: "3.6em",
            fontWeight: 800,
            letterSpacing: "-0.035em",
            margin: 0
          }}>
          Aether
        </h1>
      </div>

      {/* Card */}
      <div
        style={{
          position: "relative",
          zIndex: 1002,
          width: "90%",
          maxWidth: 520,
          background: UI_COLORS.surface,
          borderRadius: "24px",
          padding: "42px 40px 36px 40px",
          backdropFilter: "blur(22px)",
          boxShadow:
            "0 12px 36px rgba(0,0,0,0.75), inset 0 0 0.5px rgba(255,255,255,0.60)",
          border: "1px solid rgba(255,255,255,0.1)",
          animation: "fadeIn 0.4s ease"
        }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 26,
            fontSize: "1.3em",
            color: UI_COLORS.textLowEmphasis,
            fontWeight: 500
          }}>
          <span>
            Step {currentStep} <span style={{ opacity: 0.6 }}>of 2</span>
          </span>
        </div>
        {renderStepContent()}
      </div>
    </div>
  )
}

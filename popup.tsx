import React, { useEffect } from "react"
import { useStorage } from "@plasmohq/storage/hook"
import { Storage } from "@plasmohq/storage"
import { Trash2 } from "lucide-react"
import logo from "./assets/icon.png"
import chatgptLogo from "./assets/chatgpt.png"
import claudeLogo from "./assets/claude.png"
import geminiLogo from "./assets/gemini.png"
import perplexityLogo from "./assets/perplexity.png"
import grokLogo from "./assets/grok.jpg"

const localStore = new Storage({ area: "local" })

interface MemoryObject {
  id?: string
  type: string
  prompt: string
  memory: string
  tags: string[]
  timestamp: string
  origin: string
}

const loadFont = () => {
  const link = document.createElement("link")
  link.href =
    "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
  link.rel = "stylesheet"
  document.head.appendChild(link)
}

const UI_COLORS = {
  background: "radial-gradient(circle at 20% 20%, #0d1117, #080a0d 75%)",
  surface: "rgba(255, 255, 255, 0.07)",
  textHighEmphasis: "#F9FAFB",
  textLowEmphasis: "#AEB8C4",
  accentFaint: "rgba(124, 58, 237, 0.25)"
}

const FONT_FAMILY = "'Inter', 'Plus Jakarta Sans', 'SF Pro Display', sans-serif"

const hostLogos: Record<string, string> = {
  chatgpt: chatgptLogo,
  claude: claudeLogo,
  gemini: geminiLogo,
  perplexity: perplexityLogo,
  grok: grokLogo
}

export default function PopupIndex() {
  const [memories, setMemories] = useStorage<MemoryObject[]>(
    { key: "memories", instance: localStore },
    []
  )

  useEffect(() => {
    loadFont()
    // Inject subtle scrollbar style
    const style = document.createElement("style")
    style.innerHTML = `
      ::-webkit-scrollbar {
        width: 6px;
      }
      ::-webkit-scrollbar-track {
        background: transparent;
      }
      ::-webkit-scrollbar-thumb {
        background-color: rgba(255,255,255,0.15);
        border-radius: 10px;
        transition: background-color 0.3s ease;
      }
      ::-webkit-scrollbar-thumb:hover {
        background-color: rgba(255,255,255,0.25);
      }
    `
    document.head.appendChild(style)
  }, [])

  const handleDelete = (memoryToDelete: MemoryObject) => {
    const newMemories = memories.filter(
      (m) => m.timestamp !== memoryToDelete.timestamp
    )
    setMemories(newMemories)

    chrome.runtime.sendMessage(
      {
        action: "deleteMemory",
        memory: memoryToDelete
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error(
            "[Aether] Error deleting memory:",
            chrome.runtime.lastError.message
          )
        } else {
          console.log("[Aether] Delete memory response:", response?.status)
        }
      }
    )
  }

  const displayedMemories = [...memories].reverse()

  const extractOrigin = (url: string): string => {
    try {
      const hostname = new URL(url).hostname.toLowerCase()
      if (hostname.includes("chatgpt")) return "chatgpt"
      if (hostname.includes("claude")) return "claude"
      if (hostname.includes("gemini")) return "gemini"
      if (hostname.includes("perplexity")) return "perplexity"
      if (hostname.includes("grok")) return "grok"
      return "unknown"
    } catch {
      return "unknown"
    }
  }

  const formatDate = (timestamp: string): string => {
    const date = new Date(timestamp)
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true
    })
  }

  return (
    <div
      style={{
        width: 420,
        height: 520,
        background: UI_COLORS.background,
        color: UI_COLORS.textHighEmphasis,
        fontFamily: FONT_FAMILY,
        overflowY: "auto",
        overflowX: "hidden",
        display: "flex",
        flexDirection: "column",
        padding: "20px",
        outline: "none",
        border: "none",
        boxShadow: "none",
        scrollbarWidth: "thin",
        scrollbarColor: "rgba(255,255,255,0.15) transparent"
      }}>
      {/* Header */}
      <div
        style={{
          textAlign: "center",
          marginBottom: 16,
          paddingBottom: 10,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          borderBottom: "1px solid rgba(255,255,255,0.08)"
        }}>
        <img
          src={logo}
          alt="Aether Logo"
          style={{
            width: 34,
            height: 34,
            filter: "drop-shadow(0 2px 6px rgba(124,58,237,0.6))"
          }}
        />
        <h1
          style={{
            fontSize: "2em",
            fontWeight: 700,
            letterSpacing: "-0.02em"
          }}>
          Aether
        </h1>
      </div>

      {/* Memory List */}
      {displayedMemories.length === 0 ? (
        <p
          style={{
            textAlign: "center",
            color: UI_COLORS.textLowEmphasis,
            fontSize: "1em",
            marginTop: 40
          }}>
          No memories saved yet.
        </p>
      ) : (
        displayedMemories.map((memory) => {
          const originHost = extractOrigin(memory.origin)
          const memoryDate = formatDate(memory.timestamp)
          const originLogo = hostLogos[originHost] || logo

          return (
            <div
              key={memory.timestamp}
              style={{
                background: UI_COLORS.surface,
                margin: "10px 0",
                padding: "18px 20px",
                borderRadius: 16,
                boxShadow: "0 4px 10px rgba(0,0,0,0.25)",
                transition: "background 0.2s ease",
                border: "none"
              }}
              onMouseOver={(e) =>
                (e.currentTarget.style.background = "rgba(255,255,255,0.12)")
              }
              onMouseOut={(e) =>
                (e.currentTarget.style.background = UI_COLORS.surface)
              }>
              {/* First Line: Origin + Memory + Delete */}
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: 8
                }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 10,
                    flex: 1
                  }}>
                  <img
                    src={originLogo}
                    alt="Origin Logo"
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 6,
                      marginTop: 3
                    }}
                  />
                  <p
                    style={{
                      fontSize: "1.5em",
                      lineHeight: 1.6,
                      color: UI_COLORS.textHighEmphasis,
                      fontWeight: 500,
                      margin: 0,
                      flex: 1
                    }}>
                    {memory.memory}
                  </p>
                </div>

                <button
                  title="Delete memory"
                  onClick={() => handleDelete(memory)}
                  style={{
                    border: "none",
                    background: "transparent",
                    color: "#f87171",
                    cursor: "pointer",
                    padding: 4,
                    borderRadius: 6,
                    transition: "background 0.2s ease"
                  }}
                  onMouseOver={(e) =>
                    (e.currentTarget.style.background =
                      "rgba(239,68,68,0.15)")
                  }
                  onMouseOut={(e) =>
                    (e.currentTarget.style.background = "transparent")
                  }>
                  <Trash2 size={18} />
                </button>
              </div>

              {/* Second Line: Tags + Date */}
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  marginTop: 12
                }}>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 8,
                    flexShrink: 1,
                    minWidth: 0
                  }}>
                  {memory.tags?.length > 0 &&
                    memory.tags.map((tag, i) => (
                      <span
                        key={i}
                        style={{
                          background: UI_COLORS.accentFaint,
                          color: UI_COLORS.textHighEmphasis,
                          padding: "6px 12px",
                          borderRadius: 10,
                          fontSize: "1em",
                          fontWeight: 600
                        }}>
                        #{tag}
                      </span>
                    ))}
                </div>
                <p
                  style={{
                    fontSize: "1em",
                    color: UI_COLORS.textLowEmphasis,
                    fontWeight: 500,
                    marginLeft: "auto",
                    whiteSpace: "nowrap"
                  }}>
                  {memoryDate}
                </p>
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}

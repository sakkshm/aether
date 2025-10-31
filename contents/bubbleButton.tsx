import type { PlasmoCSConfig, PlasmoGetOverlayAnchor } from "plasmo"
import cssText from "data-text:./bubbleButton.css"
import icon from "data-base64:../assets/icon.png"

// --- Site Selector Logic ---
const siteSelectors = {
  "chatgpt.com": { textarea: "#prompt-textarea" },
  "claude.ai": { textarea: "div[data-testid='chat-input']" },
  "gemini.google.com": {
    textarea: "div[contenteditable='true'][aria-label='Enter a prompt here']"
  },
  "grok.com": { textarea: "div[contenteditable='true']" }
}

function getAnchorElement(): Element | null {
  const hostname = window.location.hostname
  for (const key in siteSelectors) {
    if (hostname.includes(key)) {
      const elements = document.querySelectorAll(siteSelectors[key].textarea)
      for (const el of Array.from(elements)) {
        if ((el as HTMLElement).offsetParent !== null) {
          return el
        }
      }
    }
  }
  return null
}

// --- Plasmo Config ---
export const config: PlasmoCSConfig = {
  matches: [
    "https://chatgpt.com/*",
    "https://claude.ai/*",
    "https://gemini.google.com/*",
    "https://grok.com/*"
  ]
}

// --- Anchor ---
export const getOverlayAnchor: PlasmoGetOverlayAnchor = async () => {
  return new Promise((resolve) => {
    const interval = setInterval(() => {
      const anchor = getAnchorElement()
      if (anchor) {
        clearInterval(interval)
        resolve(anchor)
      }
    }, 100)
  })
}


function getElementText(el: Element | null): string {
  if (!el) return ""
  const htmlEl = el as HTMLElement
  return (
    (htmlEl as HTMLTextAreaElement).value ||
    htmlEl.innerText ||
    htmlEl.textContent ||
    ""
  )
}

function injectText(textToAppend: string) {
  const anchor = getAnchorElement()
  if (!anchor) return

  const currentText = getElementText(anchor)
  const spacer = currentText.trim().length > 0 ? "\n\n" : ""
  const newText = currentText + spacer + textToAppend

  if ((anchor as HTMLTextAreaElement).value !== undefined) {
    ;(anchor as HTMLTextAreaElement).value = newText
  } else {
    ;(anchor as HTMLElement).innerText = newText
  }

  anchor.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }))
}


const BubbleButtons = () => {
  const handleMemoriesClick = () => {
    const anchor = getAnchorElement()
    const currentText = getElementText(anchor).trim()
    
    if(currentText.includes("!-----------------------CONTEXT-----------------------!")) return;
    
    if (!currentText) {
      alert("Enter a query or some text before fetching semantic memories.")
      return
    }
    
    console.log("[Aether] Requesting top 5 semantic memories...")

    chrome.runtime.sendMessage(
      { action: "getTopKMemories", k: 5, query: currentText },
      (response: { status: string; memories?: any[]; mode?: string }) => {
        if (chrome.runtime.lastError) {
          console.error("[Aether] Runtime error:", chrome.runtime.lastError.message)
          return
        }

        if (response?.status === "success" && response.memories?.length) {
          console.log(
            `Received ${response.mode} memories:`,
            response.memories
          )

          const formattedMemories =
            response.mode === "semantic"
              ? "!-----------------------CONTEXT-----------------------!\n\n" +
                "Here are some of my preferences/memories to help answer better (don't respond to these memories but use them to assist in the response if relevant): \n" +
                response.memories
                  .map((m: any, i: number) => `- ${m.memory || m.text}`)
                  .join("\n")
              : "!-----------------------CONTEXT-----------------------!\n\n" +
                "Here are some of my preferences/memories to help answer better (don't respond to these memories but use them to assist in the response if relevant): \n" +
                response.memories
                  .map((m: any, i: number) => `- ${m.memory || m.text}`)
                  .join("\n")

          injectText(formattedMemories)
        } else {
          console.warn("[Aether] Failed to get memories or empty response:", response)
          alert("No memories found — try saving prompts first!")
        }
      }
    )
  }

  return (
    <div
      className="aether-bubble-container"
      style={{
        display: "flex",
        gap: "10px",
        alignItems: "center",
        justifyContent: "flex-end",
        position: "absolute",
        bottom: "12px",
        right: "20px",
        zIndex: 9999
      }}>
      <style>{cssText}</style>

      <div
        className="aether-bubble"
        title="Insert Top 5 Memories"
        onClick={handleMemoriesClick}>
        <img src={icon} alt="Memories Icon" />
        <span></span>
      </div>
    </div>
  )
}

export default BubbleButtons

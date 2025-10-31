import type { PlasmoCSConfig, PlasmoGetOverlayAnchor } from "plasmo"
import cssText from "data-text:./bubbleButton.css"
import icon from "data-base64:../assets/icon.png"

// 1. --- Site Selector Logic ---
const siteSelectors = {
  "chatgpt.com": { textarea: "#prompt-textarea" },
  "claude.ai": { textarea: "div[data-testid='chat-input']" },
  "gemini.google.com": {
    textarea: "div[contenteditable='true'][aria-label='Enter a prompt here']"
  },
  "grok.com": {
    textarea: "div[contenteditable='true']",
  }
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

// 2. --- Plasmo Configuration ---
export const config: PlasmoCSConfig = {
  matches: [
    "https://chatgpt.com/*",
    "https://claude.ai/*",
    "https://gemini.google.com/*",
    "https://grok.com/*"
  ]
}

// 3. --- Anchor Function ---
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

// 4. --- Helper functions ---
function getElementText(el: Element | null): string {
  if (!el) return "";
  const htmlEl = el as HTMLElement;
  return (htmlEl as HTMLTextAreaElement).value || htmlEl.innerText || htmlEl.textContent || "";
}

function injectText(textToAppend: string) {
  const anchor = getAnchorElement()
  if (!anchor) return

  const currentText = getElementText(anchor);
  const spacer = currentText.trim().length > 0 ? "\n\n---\n\n" : "";
  const newText = currentText + spacer + textToAppend;

  if ((anchor as HTMLTextAreaElement).value !== undefined) {
    (anchor as HTMLTextAreaElement).value = newText
  } else {
    (anchor as HTMLElement).innerText = newText
  }

  anchor.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }))
}

// 5. --- React Component ---
const BubbleButton = () => {
  const handleClick = () => {
    console.log("Aether bubble clicked! Requesting prompts...");

    chrome.runtime.sendMessage(
      { action: "getLast5Prompts" },
      (response: { status: string; prompts?: any[] }) => {
        if (chrome.runtime.lastError) {
          console.error(chrome.runtime.lastError.message)
          return
        }

        if (response.status === "success" && response.prompts) {
          console.log("Received prompts:", response.prompts)
          
          const formattedPrompts = "Here are my last 5 saved prompts for context:\n\n" + 
            response.prompts
              .map((p, i) => `Prompt ${i + 1}: ${p.text}`)
              .join("\n\n");

          injectText(formattedPrompts)
        } else {
          console.error("Failed to get prompts.")
        }
      }
    )
  }

  return (
    <div className="aether-bubble" onClick={handleClick}>
      <style>{cssText}</style>
      <img src={icon} alt="Aether Icon" />
    </div>
  )
}

export default BubbleButton
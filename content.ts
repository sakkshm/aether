// content.ts
import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: [
    "https://chatgpt.com/*",
    "https://claude.ai/*",
    "https://gemini.google.com/*",
    "https://grok.com/*"
  ]
}

console.log("[Aether] Prompt saver content script loaded.");

// --- Type Definitions ---
interface SiteConfig {
  textarea: string;
  button: string;
}

interface SiteSelectors {
  [key: string]: SiteConfig;
}

// --- Constants ---
const siteSelectors: SiteSelectors = {
  "chatgpt.com": {
    textarea: "#prompt-textarea",
    button: "#composer-submit-button",
  },
  "claude.ai": {
    textarea: "div[data-testid='chat-input']",
    button: "button[aria-label='Send message']",
  },
  "gemini.google.com": {
    textarea: "div[contenteditable='true'][aria-label='Enter a prompt here']",
    button: "button.send-button",
  },
  "grok.com": {
    textarea: "div[contenteditable='true']",
    button: "button[aria-label='Submit']",
  }
};

// --- Functions ---
function getSiteConfig(): SiteConfig | null {
  const hostname = window.location.hostname;
  for (const key in siteSelectors) {
    if (hostname.includes(key)) {
      return siteSelectors[key];
    }
  }
  return null;
}

function sendPromptMessage(promptText: string): void {
  if (!chrome.runtime?.id) {
    console.warn("[Aether] Extension context invalidated. Please refresh the page.");
    return;
  }

  console.log("[Aether] Raw prompt text read:", JSON.stringify(promptText));

  if (promptText && promptText.trim()) {
    console.log("[Aether] Sending prompt to background:", promptText.trim());
    chrome.runtime.sendMessage(
      {
        action: "savePrompt",
        prompt: promptText.trim(),
      },
      (response: { status: string }) => {
        if (chrome.runtime.lastError) {
          console.error(chrome.runtime.lastError.message);
        } else {
          console.log(response.status);
        }
      }
    );
  } else {
    console.log("[Aether] Prompt text was empty or just whitespace. Not sending.");
  }
}

// Helper to get text from different element types
function getElementText(el: Element | null): string {
  if (!el) return "";
  const htmlEl = el as HTMLElement;
  return (htmlEl as HTMLTextAreaElement).value || htmlEl.innerText || htmlEl.textContent || "";
}

function initPromptListeners(): void {
  const config = getSiteConfig();
  if (!config) {
    console.log("[Aether] No config for this site.");
    return;
  }

  let lastKnownPromptText = "";

  // --- LISTENER 1: For Button Clicks ---
  console.log("[Aether] Attaching DELEGATED mousedown listener to document.");
  document.addEventListener("mousedown", (event: MouseEvent) => {
    const target = event.target as HTMLElement;
    const button = target.closest(config.button);

    if (button) {
      console.log("[Aether] Delegated mousedown detected on button!");
      const textarea = document.querySelector(config.textarea);

      if (!textarea) {
        console.error("[Aether] Button clicked, but could not find textarea!");
        return;
      }

      const promptText = getElementText(textarea);
      sendPromptMessage(promptText);
    }
  });

  // --- LISTENER 2: 'input' (for Caching) ---
  console.log("[Aether] Attaching DELEGATED input listener (CAPTURE phase) for caching.");
  document.addEventListener("input", (event: Event) => {
    const target = event.target as HTMLElement;
    const textarea = target.closest(config.textarea);

    if (textarea) {
      lastKnownPromptText = getElementText(textarea);
    }
  }, true); // Use capture phase


  // --- LISTENER 3: 'keydown' (for Sending) ---
  console.log("[Aether] Attaching DELEGATED keydown listener (CAPTURE phase) for sending.");
  document.addEventListener("keydown", (event: KeyboardEvent) => {
    const target = event.target as HTMLElement;
    const textarea = target.closest(config.textarea);

    if (textarea && event.key === 'Enter' && !event.shiftKey) {
      console.log("[Aether] 'Enter' keydown detected! Sending last known prompt.");

      sendPromptMessage(lastKnownPromptText);
      lastKnownPromptText = "";
    }
  }, true); // Use capture phase
}

// --- Start ---
initPromptListeners();
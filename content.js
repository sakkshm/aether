export const config = {
  matches: [
    "https://chatgpt.com/*",
    "https://claude.ai/*",
    "https://gemini.google.com/*",
    "https://grok.com/*"
  ]
}

console.log("Prompt saver content script loaded.");

const siteSelectors = {
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
    textarea: "textarea[aria-label='Ask Grok anything']",
    button: "button[aria-label='Submit']",
  }
};

function getSiteConfig() {
  const hostname = window.location.hostname;
  for (const key in siteSelectors) {
    if (hostname.includes(key)) {
      return siteSelectors[key];
    }
  }
  return null;
}

function sendPromptMessage(promptText) {
  // Check if we have a valid (non-invalidated) connection
  if (!chrome.runtime?.id) {
    console.warn("Extension context invalidated. Please refresh the page.");
    return;
  }
  
  console.log("Raw prompt text read:", JSON.stringify(promptText));

  if (promptText && promptText.trim()) {
    console.log("Sending prompt to background:", promptText.trim());
    chrome.runtime.sendMessage(
      {
        action: "savePrompt",
        prompt: promptText.trim(),
      },
      (response) => {
        // This check prevents the "Extension context invalidated" error
        // from appearing in the console if the context is gone.
        if (chrome.runtime.lastError) {
          console.error(chrome.runtime.lastError.message);
        } else {
          console.log(response.status);
        }
      }
    );
  } else {
    console.log("Prompt text was empty or just whitespace. Not sending.");
  }
}

function initPromptListeners() {
  const config = getSiteConfig();
  if (!config) {
    console.log("No config for this site.");
    return;
  }
  
  let lastKnownPromptText = "";

  // --- LISTENER 1: For Button Clicks ---
  console.log("Attaching DELEGATED mousedown listener to document.");
  document.addEventListener("mousedown", (event) => {
    const button = event.target.closest(config.button);

    if (button) {
      console.log("Delegated mousedown detected on button!");
      const textarea = document.querySelector(config.textarea);

      if (!textarea) {
        console.error("Button clicked, but could not find textarea!");
        return;
      }
      
      const promptText = textarea.value || textarea.innerText || textarea.textContent;
      sendPromptMessage(promptText);
    }
  });

  // --- LISTENER 2: 'input' (for Caching) ---
  // This fires every time the text in the box changes (typing, paste, etc.)
  console.log("Attaching DELEGATED input listener (CAPTURE phase) for caching.");
  document.addEventListener("input", (event) => {
    const textarea = event.target.closest(config.textarea);
    
    // If the input event happened in our textarea, update the cache.
    if (textarea) {
      lastKnownPromptText = textarea.value || textarea.innerText || textarea.textContent;
    }
  }, true); // Use capture phase

  
  // --- LISTENER 3: 'keydown' (for Sending) ---
  // This listener fires *before* the 'Enter' key is released.
  console.log("Attaching DELEGATED keydown listener (CAPTURE phase) for sending.");
  document.addEventListener("keydown", (event) => {
    const textarea = event.target.closest(config.textarea);

    // Check if the 'Enter' key was PRESSED in our textarea
    if (textarea && event.key === 'Enter' && !event.shiftKey) {
      console.log("'Enter' keydown detected! Sending last known prompt.");
      
      // Send the text we saved during the 'input' event
      sendPromptMessage(lastKnownPromptText);
      
      // Clear the cache
      lastKnownPromptText = ""; 
    }
  }, true); // Use capture phase
}

// Start the whole process
initPromptListeners();


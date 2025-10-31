// background.js
import "./setup-env.js"
import { Storage } from "@plasmohq/storage"

console.log("Background script started.");

const dbPromise = (async () => {
  console.log("Dynamically importing EntityDB...");
  
  try {
    const { EntityDB } = await import("@babycommando/entity-db");
    console.log("EntityDB module loaded successfully.");
    
    const listStorage = new Storage({ area: "local" });
    
    console.log("Initializing EntityDB with model: Xenova/all-MiniLM-L6-v2");
    const vectorDb = new EntityDB({
      vectorPath: "aether_vector_db",
      model: "Xenova/all-MiniLM-L6-v2",
    });
    
    console.log("✅ Databases initialized. Model will download on first use.");
    return { listStorage, vectorDb };
  } catch (error) {
    console.error("❌ Failed to initialize:", error);
    return { 
      listStorage: new Storage({ area: "local" }), 
      vectorDb: null 
    };
  }
})();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "savePrompt") {
    console.log("Prompt received:", message.prompt);
    (async () => {
      try {
        const { listStorage, vectorDb } = await dbPromise;
        const newPromptObject = {
          text: message.prompt,
          timestamp: new Date().toISOString(),
          origin: sender.tab?.url || "unknown"
        }
        
        // Save to list storage
        const currentPrompts = await listStorage.get("prompts") || [];
        await listStorage.set("prompts", [...currentPrompts, newPromptObject]);
        console.log("✅ Prompt saved to listStorage!");
        
        // Try to save to vector DB
        if (vectorDb) {
          try {
            console.log("Vectorizing prompt...");
            await vectorDb.insert(newPromptObject);
            console.log("✅ Prompt vectorized and saved!");
            sendResponse({ status: "success" });
          } catch (vectorError) {
            console.error("❌ Vector DB error:", vectorError);
            sendResponse({ status: "saved without vectorization" });
          }
        } else {
          sendResponse({ status: "saved without vectorization" });
        }
      } catch (err) {
        console.error("❌ Error:", err);
        sendResponse({ status: "error" });
      }
    })(); 
    return true;
  }
});
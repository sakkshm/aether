// background.ts
import "./setup-env.ts" // Import the setup file first
import { Storage } from "@plasmohq/storage"
import type { EntityDB as EntityDBType } from "@babycommando/entity-db"

console.log("Background script started.");

// --- Type Definitions ---
interface PromptObject {
  text: string;
  timestamp: string;
  origin: string;
}

interface DbHandles {
  listStorage: Storage;
  vectorDb: EntityDBType | null;
}

interface SavePromptMessage {
  action: "savePrompt";
  prompt: string;
}

// --- Database Initialization ---
const dbPromise: Promise<DbHandles> = (async () => {
  console.log("Dynamically importing EntityDB...");
  
  try {
    // Dynamically import the class
    const { EntityDB } = await import("@babycommando/entity-db");
    console.log("EntityDB module loaded successfully.");
    
    const listStorage = new Storage({ area: "local" });
    
    console.log("Initializing EntityDB with model: Xenova/all-MiniLM-L6-v2");
    const vectorDb = new EntityDB({
      vectorPath: "aether_vector_db",
      model: "Xenova/all-MiniLM-L6-v2",
    }) as EntityDBType; // Cast to the imported type
    
    console.log("✅ Databases initialized. Model will download on first use.");
    return { listStorage, vectorDb };
  } catch (error) {
    console.error("❌ Failed to initialize:", error as Error);
    return { 
      listStorage: new Storage({ area: "local" }), 
      vectorDb: null 
    };
  }
})();

// --- Message Listener ---
chrome.runtime.onMessage.addListener((
  message: SavePromptMessage, 
  sender: chrome.runtime.MessageSender, 
  sendResponse: (response?: any) => void
) => {
  if (message.action === "savePrompt") {
    console.log("Prompt received:", message.prompt);
    (async () => {
      try {
        const { listStorage, vectorDb } = await dbPromise;
        const newPromptObject: PromptObject = {
          text: message.prompt,
          timestamp: new Date().toISOString(),
          origin: sender.tab?.url || "unknown"
        }
        
        // Save to list storage
        const currentPrompts = await listStorage.get<PromptObject[]>("prompts") || [];
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
            console.error("❌ Vector DB error:", vectorError as Error);
            sendResponse({ status: "saved without vectorization" });
          }
        } else {
          console.log("Vector DB not initialized. Skipping vectorization.");
          sendResponse({ status: "saved without vectorization" });
        }
      } catch (err) {
        console.error("❌ Error:", err as Error);
        sendResponse({ status: "error" });
      }
    })(); 
    return true; // Indicates an asynchronous response
  }
});
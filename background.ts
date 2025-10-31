// background.ts
import "./setup-env.ts"
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

// New message types for the union
interface SavePromptMessage {
  action: "savePrompt";
  prompt: string;
}

interface GetPromptsMessage {
  action: "getLast5Prompts";
}

// A "union type" for all possible messages
type RuntimeMessage = SavePromptMessage | GetPromptsMessage;

// --- Database Initialization  ---
const dbPromise: Promise<DbHandles> = (async () => {
  console.log("Dynamically importing EntityDB...");
  
  try {
    const { EntityDB } = await import("@babycommando/entity-db");
    console.log("EntityDB module loaded successfully.");
    
    const listStorage = new Storage({ area: "local" });
    
    console.log("Initializing EntityDB with model: Xenova/all-MiniLM-L6-v2");
    const vectorDb = new EntityDB({
      vectorPath: "aether_vector_db",
      model: "Xenova/all-MiniLM-L6-v2",
    }) as EntityDBType;
    
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
  message: RuntimeMessage,
  sender: chrome.runtime.MessageSender, 
  sendResponse: (response?: any) => void
) => {
  
  // --- Handle Save Prompt action ---
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
        
        const currentPrompts = await listStorage.get<PromptObject[]>("prompts") || [];
        await listStorage.set("prompts", [...currentPrompts, newPromptObject]);
        console.log("✅ Prompt saved to listStorage!");
        
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
  
  // --- Handle Get Last 5 Prompts action ---
  if (message.action === "getLast5Prompts") {
    console.log("Get last 5 prompts request received");
    (async () => {
      try {
        const { listStorage } = await dbPromise;
        const allPrompts = await listStorage.get<PromptObject[]>("prompts") || [];
        
        // Get the last 5 prompts (newest first)
        const last5Prompts = allPrompts.slice(-5).reverse();
        
        sendResponse({ status: "success", prompts: last5Prompts });
      } catch (err) {
        console.error("❌ Error fetching prompts:", err as Error);
        sendResponse({ status: "error" });
      }
    })();
    return true; // Indicates an asynchronous response
  }

});
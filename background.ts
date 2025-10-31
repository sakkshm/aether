import "./setup-env.ts"
import { Storage } from "@plasmohq/storage"
import type { EntityDB as EntityDBType } from "@babycommando/entity-db"
import {
  createSummarizer,
  summarizePrompt,
  checkAvailabilityStatus,
  downloadModel,
  AvailabilityStatus
} from "./utils/summarizer"

console.log("[Aether] Background script started.")

// --- Type Definitions ---
interface PromptObject {
  text: string
  timestamp: string
  origin: string
}

interface MemoryObject {
  type: string
  prompt: string
  memory: string
  tags: string[]
  timestamp: string
  origin: string
}

interface DbHandles {
  listStorage: Storage
  vectorDb: EntityDBType | null
}

// --- Message Types ---
interface SavePromptMessage {
  action: "savePrompt"
  prompt: string
}

interface GetPromptsMessage {
  action: "getLast5Prompts"
}

interface GetTopKMemoriesMessage {
  action: "getTopKMemories"
  query?: string
  k?: number
}

type RuntimeMessage =
  | SavePromptMessage
  | GetPromptsMessage
  | GetTopKMemoriesMessage

// --- Database Initialization ---
const dbPromise: Promise<DbHandles> = (async () => {
  console.log("[Aether] Dynamically importing EntityDB...")

  try {
    const { EntityDB } = await import("@babycommando/entity-db")
    console.log("[Aether] EntityDB module loaded successfully.")

    const listStorage = new Storage({ area: "local" })

    console.log("[Aether] Initializing EntityDB")
    const vectorDb = new EntityDB({
      vectorPath: "aether_vector_db",
      model: "Xenova/all-MiniLM-L6-v2"
    }) as EntityDBType

    console.log("[Aether] Databases initialized. Model will download on first use.")
    return { listStorage, vectorDb }
  } catch (error) {
    console.error("[Aether] Failed to initialize EntityDB:", error)
    return {
      listStorage: new Storage({ area: "local" }),
      vectorDb: null
    }
  }
})()

// --- Summary API Initialization ---
const summaryAPIPromise: Promise<{ summarizer: any | null }> = (async () => {
  console.log("[Aether] Initializing Summary API...")

  try {
    const status = await checkAvailabilityStatus()
    console.log("[Aether] Model availability:", status)

    if (status === AvailabilityStatus.DOWNLOADABLE) {
      console.log("[Aether] Downloading model...")
      await downloadModel((progress) =>
        console.log("[Aether] Download progress:", (progress * 100).toFixed(2) + "%")
      )
    }

    const summarizer = await createSummarizer()
    console.log("[Aether] Summarizer API Initialized.")
    return { summarizer }
  } catch (error) {
    console.error("[Aether] Failed to initialize Summarizer:", error)
    return { summarizer: null }
  }
})()

// --- Message Listener ---
chrome.runtime.onMessage.addListener((
  message: RuntimeMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: any) => void
) => {
  // --- Handle Save Prompt ---
  if (message.action === "savePrompt") {
    console.log("[Aether] Prompt received:", message.prompt)
    
    let prompt = message.prompt;

    //Process prompt
    if(prompt.includes("!-----------------------CONTEXT-----------------------!")){
        message.prompt = prompt.split("!-----------------------CONTEXT-----------------------!")[0]
    }

    console.log("[Aether] Cleaned Prompt:", message.prompt)

      ; (async () => {
        try {
          const { listStorage, vectorDb } = await dbPromise
          const { summarizer } = await summaryAPIPromise

          const origin = sender.tab?.url || "unknown"
          const newPromptObject: PromptObject = {
            text: message.prompt,
            timestamp: new Date().toISOString(),
            origin
          }

          console.log("[Aether] Sending to summarizer...")
          const memories = summarizer
            ? await summarizePrompt(newPromptObject.text, summarizer)
            : []

          console.log("[Aether] Extracted memories:", memories)

          // Build memory objects
          const memoryObjects: MemoryObject[] = memories.map((m) => ({
            type: m.type,
            prompt: newPromptObject.text,
            memory: m.statement,
            tags: m.tags,
            timestamp: newPromptObject.timestamp,
            origin: newPromptObject.origin
          }))

          // Save prompt to listStorage
          const currentPrompts =
            (await listStorage.get<PromptObject[]>("prompts")) || []
          await listStorage.set("prompts", [...currentPrompts, newPromptObject])
          console.log("[Aether] Prompt saved to listStorage.")

          // Save memories to listStorage
          const currentMemories =
            (await listStorage.get<MemoryObject[]>("memories")) || []
          await listStorage.set("memories", [...currentMemories, ...memoryObjects])
          console.log(`Saved ${memoryObjects.length} memories.`)

          // --- Vectorization (memories only) ---
          if (vectorDb) {
            try {
              console.log("[Aether] Vectorizing extracted memories only...")

              for (const mem of memoryObjects) {
                await vectorDb.insert({
                  text: mem.memory,
                  metadata: {
                    type: mem.type,
                    tags: mem.tags,
                    timestamp: mem.timestamp,
                    origin: mem.origin,
                    sourcePrompt: mem.prompt
                  }
                })
              }

              console.log("[Aether] Memories vectorized successfully (prompt excluded).")
              sendResponse({ status: "success" })
            } catch (vectorError) {
              console.error("[Aether] Vector DB error:", vectorError)
              sendResponse({ status: "saved without vectorization" })
            }
          } else {
            console.warn("[Aether] Vector DB not initialized. Skipping vectorization.")
            sendResponse({ status: "saved without vectorization" })
          }
        } catch (err) {
          console.error("[Aether] Error in savePrompt:", err)
          sendResponse({ status: "error" })
        }
      })()

    return true
  }

  // --- Handle Get Last 5 Prompts ---
  if (message.action === "getLast5Prompts") {
    console.log("[Aether] Get last 5 prompts request received")

      ; (async () => {
        try {
          const { listStorage } = await dbPromise
          const allPrompts = (await listStorage.get<PromptObject[]>("prompts")) || []
          const last5Prompts = allPrompts.slice(-5).reverse()
          sendResponse({ status: "success", prompts: last5Prompts })
        } catch (err) {
          console.error("[Aether] Error fetching prompts:", err)
          sendResponse({ status: "error" })
        }
      })()

    return true
  }

  // --- Handle Get Top K Memories (Cosine Similarity) ---
  if (message.action === "getTopKMemories") {
    console.log("[Aether] Get top K memories request received")

      ; (async () => {
        try {
          const { listStorage, vectorDb } = await dbPromise
          const k = message.k || 5
          const queryText = message.query?.trim()

          console.log("[Aether] Query params:", { hasVectorDb: !!vectorDb, queryText, k })

          if (!vectorDb || !queryText) {
            console.warn("[Aether] No vectorDb or query provided. Using fallback.")
            const allMemories =
              (await listStorage.get<MemoryObject[]>("memories")) || []
            const topK = allMemories.slice(-k).reverse()
            sendResponse({ status: "success", mode: "recent", memories: topK })
            return
          }

          console.log(`Performing cosine similarity query for top ${k} results.`)

          try {
            console.time("VectorQueryTime")
            const results = await vectorDb.query(queryText)
            console.timeEnd("VectorQueryTime")

            //@ts-ignore
            const parsedResults = results?.results || results || []

            console.log("[Aether] Parsed results length:", parsedResults?.length)

            if (!Array.isArray(parsedResults) || parsedResults.length === 0) {
              console.warn("[Aether] No semantic matches found. Using fallback.")
              const allMemories =
                (await listStorage.get<MemoryObject[]>("memories")) || []
              const topK = allMemories.slice(-k).reverse()
              sendResponse({ status: "success", mode: "recent", memories: topK })
              return
            }

            const topK = parsedResults.slice(0, k)
            console.log("[Aether] Cosine similarity results (top K):", topK)
            sendResponse({ status: "success", mode: "semantic", memories: topK })
          } catch (err: any) {
            console.error("[Aether] Vector query failed:", err)
            const allMemories =
              (await listStorage.get<MemoryObject[]>("memories")) || []
            const topK = allMemories.slice(-k).reverse()
            sendResponse({ status: "success", mode: "recent", memories: topK })
          }
        } catch (err) {
          console.error("[Aether] Fatal error in getTopKMemories handler:", err)
          sendResponse({ status: "error" })
        }
      })()

    return true
  }
})

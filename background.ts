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
  id?: string
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

// --- Configuration ---
const DUPLICATE_THRESHOLD = 0.75 // similarity threshold to treat as duplicate

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

// --- Utility: parse results from EntityDB.query() safely ---
function parseQueryResults(raw: any): any[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  if (Array.isArray(raw.results)) return raw.results
  if (Array.isArray(raw.data)) return raw.data
  if (Array.isArray(raw.items)) return raw.items
  return []
}

// --- Utility: extract text from result entry defensively ---
function getResultText(entry: any): string | undefined {
  if (!entry) return undefined
  if (typeof entry.text === "string") return entry.text
  if (typeof entry.payload === "string") return entry.payload
  if (typeof entry.metadata?.text === "string") return entry.metadata.text
  if (typeof entry.metadata?.memory === "string") return entry.metadata.memory
  return undefined
}

// --- Helper: Find top similar result above threshold ---
async function findTopSimilar(
  vectorDb: EntityDBType,
  queryText: string,
  threshold = DUPLICATE_THRESHOLD
): Promise<{
  id: string | number | null
  score: number
  text?: string
  metadata?: any
} | null> {
  try {
    const raw = await vectorDb.query(queryText)
    const parsed = parseQueryResults(raw)
    if (!Array.isArray(parsed) || parsed.length === 0) return null

    // sort by score/similarity descending to be safe
    parsed.sort((a, b) => (b.score ?? b.similarity ?? b.cosine ?? 0) - (a.score ?? a.similarity ?? a.cosine ?? 0))

    // find first entry with score >= threshold (not only parsed[0])
    for (const entry of parsed) {
      const score = entry.score ?? entry.similarity ?? entry.cosine ?? 0
      if (typeof score === "number" && score >= threshold) {
        const id = entry.id ?? entry._id ?? entry.key ?? null
        const text = getResultText(entry) ?? entry.metadata?.memory ?? entry.metadata?.text
        return { id, score, text, metadata: entry.metadata ?? {} }
      }
    }

    return null
  } catch (err) {
    console.warn("[Aether] findTopSimilar: query failed", err)
    return null
  }
}

// --- Helper: delete vector entry by id or by query text (best-effort) ---
async function safeDeleteVector(vectorDb: EntityDBType, idOrText: string | number) {
  try {
    // If it's an id (string/number), attempt delete directly
    if (typeof idOrText === "string" || typeof idOrText === "number") {
      try {
        await vectorDb.delete(idOrText)
        console.log("[Aether] safeDeleteVector: deleted by id/text:", idOrText)
        return true
      } catch (directErr) {
        console.warn("[Aether] safeDeleteVector: direct delete failed for", idOrText, directErr)
        // fallthrough to query deletion
      }
    }

    // If direct delete failed or idOrText is not an id, try query by text to discover matching ids and delete them
    if (typeof idOrText === "string") {
      try {
        const raw = await vectorDb.query(idOrText)
        const parsed = parseQueryResults(raw)
        if (!Array.isArray(parsed) || parsed.length === 0) {
          console.warn("[Aether] safeDeleteVector: query returned no results for text:", idOrText)
          return false
        }

        for (const p of parsed) {
          const pid = p.id ?? p._id ?? p.key ?? null
          if (pid != null) {
            try {
              await vectorDb.delete(pid)
              console.log("[Aether] safeDeleteVector: deleted discovered id", pid)
            } catch (e) {
              console.warn("[Aether] safeDeleteVector: delete failed for discovered id", pid, e)
            }
          } else {
            console.warn("[Aether] safeDeleteVector: discovered entry without deletable id", p)
          }
        }
        return true
      } catch (qErr) {
        console.warn("[Aether] safeDeleteVector: query failed", qErr)
        return false
      }
    }

    return false
  } catch (err) {
    console.warn("[Aether] safeDeleteVector: unexpected error", err)
    return false
  }
}

// --- Helper: normalize text for comparisons ---
function normalize(s?: string) {
  if (!s) return ""
  return s.trim().toLowerCase()
}

// --- Helper: detect tag overlap ---
function tagsOverlap(a: string[], b: string[]) {
  const set = new Set(a.map((t) => normalize(t)))
  return b.some((t) => set.has(normalize(t)))
}

// --- Helper: simple sentiment heuristics (optional) ---
function simpleSentiment(text: string) {
  const t = text.toLowerCase()
  if (/\b(dislike|hate|don't like|dont like|do not like|not a fan|detest|loathe)\b/.test(t)) return "negative"
  if (/\b(like|love|enjoy|prefer|adore|fan of)\b/.test(t)) return "positive"
  return "neutral"
}

// --- Main Message Listener ---
chrome.runtime.onMessage.addListener((
  message: RuntimeMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: any) => void
) => {
  // --- Handle Save Prompt ---
  if (message.action === "savePrompt") {
    console.log("[Aether] Prompt received:", message.prompt)

    let promptText = message.prompt
    if (typeof promptText === "string" && promptText.includes("!-----------------------CONTEXT-----------------------!")) {
      promptText = promptText.split("!-----------------------CONTEXT-----------------------!")[0]
    }

    console.log("[Aether] Cleaned Prompt:", promptText)

    ;(async () => {
      try {
        const { listStorage, vectorDb } = await dbPromise
        const { summarizer } = await summaryAPIPromise

        const origin = sender.tab?.url || "unknown"
        const newPromptObject: PromptObject = {
          text: promptText,
          timestamp: new Date().toISOString(),
          origin
        }

        // Summarize / extract memories
        console.log("[Aether] Sending to summarizer...")
        const rawMemories = summarizer
          ? await summarizePrompt(newPromptObject.text, summarizer)
          : []

        console.log("[Aether] Extracted memories:", rawMemories)

        const memoryObjects: MemoryObject[] = (Array.isArray(rawMemories) ? rawMemories : []).map((m: any) => ({
          type: m.type,
          prompt: newPromptObject.text,
          memory: m.statement,
          tags: Array.isArray(m.tags) ? m.tags : [],
          timestamp: newPromptObject.timestamp,
          origin: newPromptObject.origin
        }))

        const currentPrompts: PromptObject[] = (await listStorage.get<PromptObject[]>("prompts")) || []
        await listStorage.set("prompts", [...currentPrompts, newPromptObject])
        console.log("[Aether] Prompt saved to listStorage.")

        const currentMemories: MemoryObject[] = (await listStorage.get<MemoryObject[]>("memories")) || []

        if (!vectorDb) {
          console.warn("[Aether] Vector DB not initialized. Storing memories locally only.")
          const merged = [...currentMemories, ...memoryObjects]
          await listStorage.set("memories", merged)
          sendResponse({ status: "saved_without_vectorization", added: memoryObjects.length })
          return
        }

        let updatedMemories = [...currentMemories]

        // Process each new memory:
        for (const mem of memoryObjects) {
          try {
            // 1) contradiction / exact conflict detection in local store (prefer this to ensure overwrite semantics)
            // Find any local memory that is:
            //  - same subject (by exact normalized memory text), OR
            //  - tags overlap and type differs (preference vs dislike)
            const normalizedNewText = normalize(mem.memory)
            const localExactIndex = updatedMemories.findIndex((m) => normalize(m.memory) === normalizedNewText)
            const localConflictIndex = updatedMemories.findIndex((m) =>
              m.type !== mem.type && (tagsOverlap(m.tags, mem.tags) || normalize(m.prompt) === normalize(mem.prompt))
            )

            let removedLocal: MemoryObject | null = null

            if (localExactIndex !== -1) {
              // exact textual duplicate exists — remove it (we'll replace)
              removedLocal = updatedMemories.splice(localExactIndex, 1)[0] ?? null
              console.log("[Aether] Removed exact local duplicate:", removedLocal?.memory)
              // also attempt to delete matching vector by id or text
              if (removedLocal?.id) {
                const deleted = await safeDeleteVector(vectorDb, removedLocal.id)
                console.log("[Aether] safeDeleteVector result for removedLocal.id:", deleted)
              } else {
                const deleted = await safeDeleteVector(vectorDb, removedLocal?.memory || "")
                console.log("[Aether] safeDeleteVector result for removedLocal.memory:", deleted)
              }
            } else if (localConflictIndex !== -1) {
              // Found a contradictory memory (e.g., like vs dislike on same tags)
              removedLocal = updatedMemories.splice(localConflictIndex, 1)[0] ?? null
              console.log("[Aether] Removed conflicting local memory (type mismatch):", removedLocal?.memory, "->", removedLocal?.type)
              if (removedLocal?.id) {
                const deleted = await safeDeleteVector(vectorDb, removedLocal.id)
                console.log("[Aether] safeDeleteVector result for removedLocal.id:", deleted)
              } else {
                const deleted = await safeDeleteVector(vectorDb, removedLocal?.memory || "")
                console.log("[Aether] safeDeleteVector result for removedLocal.memory:", deleted)
              }
            } else {
              // No clear local conflict; fall back to vector-based similarity check
              const similar = await findTopSimilar(vectorDb, mem.memory, DUPLICATE_THRESHOLD)
              if (similar && similar.id != null) {
                // check whether similar corresponds to an existing local entry by id or by similar text
                // remove matching local entries by id or text
                updatedMemories = updatedMemories.filter((existing) => {
                  if (existing.id && String(existing.id) === String(similar.id)) return false
                  if (similar.text && normalize(existing.memory) === normalize(similar.text)) return false
                  if (similar.metadata?.sourcePrompt && existing.prompt === similar.metadata.sourcePrompt) return false
                  return true
                })

                // delete the vector itself (use safeDeleteVector to be robust)
                try {
                  const deleted = await safeDeleteVector(vectorDb, similar.id)
                  console.log(`[Aether] Deleted similar vector id=${similar.id} result=${deleted}`)
                } catch (e) {
                  console.warn("[Aether] Failed to delete similar vector id:", similar.id, e)
                }
              }
            }

            // After removals, insert the new memory vector
            const inserted = await vectorDb.insert({
              text: mem.memory,
              metadata: {
                type: mem.type,
                tags: mem.tags,
                timestamp: mem.timestamp,
                origin: mem.origin,
                sourcePrompt: mem.prompt
              }
            })

            // record the actual key returned by EntityDB.insert()
            if (typeof inserted === "string" || typeof inserted === "number") {
              mem.id = String(inserted)
            } else {
              mem.id = inserted?.id ?? inserted?._id ?? inserted?.key ?? crypto.randomUUID()
            }

            updatedMemories.push(mem)
            console.log("[Aether] New/updated memory inserted:", mem.memory)
          } catch (procErr) {
            console.error("[Aether] Error during memory processing:", procErr)
            // keep mem locally if vector ops fail
            updatedMemories.push(mem)
          }
        }

        // Final deduplication before saving (by id or normalized text)
        const uniqueMemories = Object.values(
          updatedMemories.reduce((acc, m) => {
            const key = (m.id ? String(m.id) : normalize(m.memory)) || normalize(m.memory)
            acc[key] = m
            return acc
          }, {} as Record<string, MemoryObject>)
        )

        await listStorage.set("memories", uniqueMemories)
        console.log("[Aether] Local memory database cleaned and updated:", uniqueMemories.length)

        sendResponse({ status: "success", added: memoryObjects.length, currentCount: uniqueMemories.length })
      } catch (err) {
        console.error("[Aether] Error in savePrompt flow:", err)
        sendResponse({ status: "error", error: err?.message ?? String(err) })
      }
    })()

    return true
  }

  // --- Handle Get Last 5 Prompts ---
  if (message.action === "getLast5Prompts") {
    console.log("[Aether] Get last 5 prompts request received")

    ;(async () => {
      try {
        const { listStorage } = await dbPromise
        const allPrompts = (await listStorage.get<PromptObject[]>("prompts")) || []
        const last5Prompts = allPrompts.slice(-5).reverse()
        sendResponse({ status: "success", prompts: last5Prompts })
      } catch (err) {
        console.error("[Aether] Error fetching prompts:", err)
        sendResponse({ status: "error", error: err?.message ?? String(err) })
      }
    })()

    return true
  }

  // --- Handle Get Top K Memories (Cosine Similarity) ---
  if (message.action === "getTopKMemories") {
    console.log("[Aether] Get top K memories request received")

    ;(async () => {
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
          const raw = await vectorDb.query(queryText)
          console.timeEnd("VectorQueryTime")

          const parsedResults = parseQueryResults(raw)
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
        sendResponse({ status: "error", error: err?.message ?? String(err) })
      }
    })()

    return true
  }
})

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
	id?: string | number
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
interface DeleteMemoryMessage {
	action: "deleteMemory"
	memory: MemoryObject
}
type RuntimeMessage =
	| SavePromptMessage
	| GetPromptsMessage
	| GetTopKMemoriesMessage
	| DeleteMemoryMessage

// --- Configuration ---
const DUPLICATE_THRESHOLD = 0.75

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
				console.log(
					"[Aether] Download progress:",
					(progress * 100).toFixed(2) + "%"
				)
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

// --- Utility Functions ---
function parseQueryResults(raw: any): any[] {
	if (!raw) return []
	if (Array.isArray(raw)) return raw
	if (Array.isArray(raw.results)) return raw.results
	if (Array.isArray(raw.data)) return raw.data
	if (Array.isArray(raw.items)) return raw.items
	return []
}
function getResultText(entry: any): string | undefined {
	if (!entry) return undefined
	if (typeof entry.text === "string") return entry.text
	if (typeof entry.payload === "string") return entry.payload
	if (typeof entry.metadata?.text === "string") return entry.metadata.text
	if (typeof entry.metadata?.memory === "string") return entry.metadata.memory
	return undefined
}
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

		parsed.sort(
			(a, b) =>
				(b.score ?? b.similarity ?? b.cosine ?? 0) -
				(a.score ?? a.similarity ?? a.cosine ?? 0)
		)

		for (const entry of parsed) {
			const score = entry.score ?? entry.similarity ?? entry.cosine ?? 0
			if (typeof score === "number" && score >= threshold) {
				const id = entry.id ?? entry._id ?? entry.key ?? null
				const text =
					getResultText(entry) ??
					entry.metadata?.memory ??
					entry.metadata?.text
				return { id, score, text, metadata: entry.metadata ?? {} }
			}
		}

		return null
	} catch (err) {
		console.warn("[Aether] findTopSimilar: query failed", err)
		return null
	}
}
function normalize(s?: string) {
	if (!s) return ""
	return s.trim().toLowerCase()
}
// --- END Utility Functions ---

/**
 * [MODIFIED HELPER]
 * Cleanly deletes a vector by its key, coercing numeric strings to numbers.
 */
async function deleteVector(vectorDb: EntityDBType, id: string | number) {
	if (id == null) {
		console.warn("[Aether] deleteVector: called with null or undefined id.")
		return false
	}

	const key = typeof id === "string" && /^\d+$/.test(id) ? Number(id) : id

	try {
		console.log(
			`[Aether] Attempting to delete vector with key: ${key} (type: ${typeof key})`
		)
		await vectorDb.delete(key as any)
		console.log(`[Aether] Successfully called delete for key: ${key}`)
		return true
	} catch (err) {
		console.error(`[Aether] Error during vectorDb.delete(${key}):`, err)
		return false
	}
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
		if (
			typeof promptText === "string" &&
			promptText.includes("!-----------------------CONTEXT-----------------------!")
		) {
			promptText =
				promptText.split("!-----------------------CONTEXT-----------------------!")[0]
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

				const memoryObjects: MemoryObject[] = (
					Array.isArray(rawMemories) ? rawMemories : []
				)
					.map((m: any) => {
						if (typeof m === "string") {
							try {
								return JSON.parse(m)
							} catch (e) {
								console.warn(
									"[Aether] Failed to parse string-JSON from summarizer:",
									m
								)
								return null 
							}
						}
						if (typeof m === "object" && m !== null && m.statement) {
							return m 
						}
						console.warn("[Aether] Discarding invalid memory item:", m)
						return null 
					})
					.filter((m) => m !== null)
					.map((m: any) => ({
						
						type: m.type,
						prompt: newPromptObject.text,
						memory: m.statement,
						tags: Array.isArray(m.tags) ? m.tags : [],
						timestamp: newPromptObject.timestamp,
						origin: newPromptObject.origin
					}))
				// --- END: ROBUST PARSING FIX ---

				const currentPrompts: PromptObject[] =
					(await listStorage.get<PromptObject[]>("prompts")) || []
				await listStorage.set("prompts", [...currentPrompts, newPromptObject])
				console.log("[Aether] Prompt saved to listStorage.")

				const currentMemories: MemoryObject[] =
					(await listStorage.get<MemoryObject[]>("memories")) || []

				if (!vectorDb) {
					console.warn(
						"[Aether] Vector DB not initialized. Storing memories locally only."
					)
					const merged = [...currentMemories, ...memoryObjects]
					await listStorage.set("memories", merged)
					sendResponse({
						status: "saved_without_vectorization",
						added: memoryObjects.length
					})
					return
				}

				let updatedMemories = [...currentMemories]

				// Process each new memory:
				for (const mem of memoryObjects) {

          if (!mem.memory) {
						console.warn("[Aether] Skipping memory with no statement text.")
						continue
					}
					
					const normalizedNewText = normalize(mem.memory)
					let conflictText = ""
					if (normalizedNewText.startsWith("user dislikes ")) {
						conflictText = normalizedNewText.replace("user dislikes ", "user enjoys ")
					} else if (normalizedNewText.startsWith("user enjoys ")) {
						conflictText = normalizedNewText.replace("user enjoys ", "user dislikes ")
					} else if (normalizedNewText.startsWith("user prefers ")) {
						conflictText = normalizedNewText.replace("user prefers ", "user dislikes ")
					} else if (normalizedNewText.startsWith("user likes ")) {
						conflictText = normalizedNewText.replace("user likes ", "user dislikes ")
					}

					const localExactIndex = updatedMemories.findIndex(
						(m) => normalize(m.memory) === normalizedNewText
					)
					const localConflictIndex = conflictText
						? updatedMemories.findIndex(
								(m) => normalize(m.memory) === conflictText
						  )
						: -1

					let oldMemory: MemoryObject | null = null

					if (localExactIndex !== -1) {
						oldMemory = updatedMemories.splice(localExactIndex, 1)[0]
						console.log("[Aether] Found exact local duplicate:", oldMemory?.memory)
					} else if (localConflictIndex !== -1) {
						oldMemory = updatedMemories.splice(localConflictIndex, 1)[0]
						console.log(
							"[Aether] Found conflicting local memory (enjoys/dislikes):",
							oldMemory?.memory
						)
					} else {
						// This query will no longer crash because the DB is clean
						const similar = await findTopSimilar(
							vectorDb,
							mem.memory,
							DUPLICATE_THRESHOLD
						)
						if (similar && similar.id) {
							const oldMemIndex = updatedMemories.findIndex(
								(m) => String(m.id) === String(similar.id)
							)
							if (oldMemIndex !== -1) {
								oldMemory = updatedMemories.splice(oldMemIndex, 1)[0]
								console.log(
									"[Aether] Found similar vector, removing local mem:",
									oldMemory?.memory
								)
							}
						}
					}

					// --- Step 1: Delete the old vector (if one was found) ---
					if (oldMemory && oldMemory.id) {
						await deleteVector(vectorDb, oldMemory.id)
					}

					// --- Step 2: Insert the new vector ---
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

					// --- Step 3: Save the NEW vector key (PRESERVING TYPE) ---
					if (typeof inserted === "string" || typeof inserted === "number") {
						mem.id = inserted
					} else {
						mem.id =
							(inserted as any)?.id ??
							(inserted as any)?._id ??
							(inserted as any)?.key ??
							crypto.randomUUID()
					}
					console.log(
						`[Aether] Inserted new memory '${
							mem.memory
						}' with new id: ${mem.id} (type: ${typeof mem.id})`
					)

					// --- Step 4: Add the new memory (with its ID) to our local list ---
					updatedMemories.push(mem)
				}

				// --- Step 5: Save the fully updated list to storage ---
				await listStorage.set("memories", updatedMemories)
				console.log(
					"[Aether] Local memory database updated:",
					updatedMemories.length
				)

				sendResponse({
					status: "success",
					added: memoryObjects.length,
					currentCount: updatedMemories.length
				})
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
				const allPrompts =
					(await listStorage.get<PromptObject[]>("prompts")) || []
				const last5Prompts = allPrompts.slice(-5).reverse()
				sendResponse({ status: "success", prompts: last5Prompts })
			} catch (err) {
				console.error("[Aether] Error fetching prompts:", err)
				sendResponse({ status: "error", error: err?.message ?? String(err) })
			}
		})()
		return true
	}

	// --- Handle Get Top K Memories ---
	if (message.action === "getTopKMemories") {
		console.log("[Aether] Get top K memories request received")
		;(async () => {
			try {
				const { listStorage, vectorDb } = await dbPromise
				const k = message.k || 5
				const queryText = message.query?.trim()

				console.log(
					"[Aether] Query params:",
					{ hasVectorDb: !!vectorDb, queryText, k }
				)

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

	// --- Handle Delete Memory ---
	if (message.action === "deleteMemory") {
		console.log("[Aether] Delete memory request received", message.memory)

		;(async () => {
			try {
				const { listStorage, vectorDb } = await dbPromise
				const memoryToDelete = message.memory

				if (!memoryToDelete) {
					throw new Error("No memory object provided for deletion.")
				}

				if (vectorDb && memoryToDelete.id) {
					await deleteVector(vectorDb, memoryToDelete.id)
				} else {
					console.warn(
						"[Aether] Cannot delete vector: No DB or memory has no ID."
					)
				}

				const currentMemories: MemoryObject[] =
					(await listStorage.get<MemoryObject[]>("memories")) || []

				const newMemories = currentMemories.filter(
					(m) => m.timestamp !== memoryToDelete.timestamp
				)

				await listStorage.set("memories", newMemories)
				console.log(
					`[Aether] Local memory updated. ${newMemories.length} remaining.`
				)

				sendResponse({
					status: "success",
					deleted: true,
					remaining: newMemories.length
				})
			} catch (err) {
				console.error("[Aether] Error in deleteMemory flow:", err)
				sendResponse({ status: "error", error: err?.message ?? String(err) })
			}
		})()

		return true
	}
})
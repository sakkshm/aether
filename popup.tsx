import { useStorage } from "@plasmohq/storage/hook"
import { Storage } from "@plasmohq/storage"
import "./popup.css"

const localStore = new Storage({ area: "local" })

interface MemoryObject {
	id?: string
	type: string
	prompt: string
	memory: string
	tags: string[]
	timestamp: string
	origin: string
}

function PopupIndex() {
	const [memories, setMemories] = useStorage<MemoryObject[]>(
		{ key: "memories", instance: localStore },
		[] // default value
	)

	// --- START FIX ---
	const handleDelete = (memoryToDelete: MemoryObject) => {
		// 1. Optimistically update the UI by filtering local storage
		const newMemories = memories.filter(
			(m) => m.timestamp !== memoryToDelete.timestamp
		)
		setMemories(newMemories)

		// 2. Send message to background to delete from vector DB
		chrome.runtime.sendMessage(
			{
				action: "deleteMemory",
				memory: memoryToDelete
			},
			(response) => {
				if (chrome.runtime.lastError) {
					console.error(
						"[Aether] Error deleting memory:",
						chrome.runtime.lastError.message
					)
				} else {
					console.log("[Aether] Delete memory response:", response.status)
				}
			}
		)
	}
	// --- END FIX ---

	const displayedMemories = [...memories].reverse()

	return (
		<div style={{ width: "380px" }}>
			<h1>Stored Memories</h1>
			<ul id="memories-list">
				{displayedMemories.length === 0 ? (
					<li className="empty-message">No memories saved yet.</li>
				) : (
					displayedMemories.map((memory) => {
						let originHost = "Unknown Origin"
						try {
							originHost = new URL(memory.origin).hostname
						} catch (e) {
							console.warn("[Aether] Invalid memory origin:", memory.origin)
						}

						const memoryDate = new Date(memory.timestamp).toLocaleString()

						return (
							<li
								key={memory.timestamp}
								className="memory-item"
								data-timestamp={memory.timestamp}>
								<div className="memory-header">
									<span className="memory-meta">
										{`${originHost} — ${memoryDate}`}
									</span>
									<button
										className="delete-btn"
										title="Delete memory"
										onClick={() => handleDelete(memory)}>
										&times;
									</button>
								</div>

								<p className="memory-text">{memory.memory}</p>
								{memory.tags?.length > 0 && (
									<div className="memory-tags">
										{memory.tags.map((tag, i) => (
											<span key={i} className="tag">
												{tag}
											</span>
										))}
									</div>
								)}
							</li>
						)
					})
				)}
			</ul>
		</div>
	)
}

export default PopupIndex
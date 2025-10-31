// popup/index.tsx

import { useStorage } from "@plasmohq/storage/hook"
import { Storage } from "@plasmohq/storage"
import "./popup.css"

// 2. Create a storage instance that points to "local"
const localStore = new Storage({
  area: "local"
})

function PopupIndex() {
  // 3. Tell the hook to use your "local" storage instance
  const [prompts, setPrompts] = useStorage(
    {
      key: "prompts",
      instance: localStore
    },
    [] // The default value (empty array) goes here
  )

  const handleDelete = (timestamp) => {
    const newPrompts = prompts.filter((p) => p.timestamp !== timestamp)
    setPrompts(newPrompts)
  }

  const displayedPrompts = [...prompts].reverse()

  return (
    <div style={{ width: "350px" }}>
      <h1>Saved Prompts</h1>
      <ul id="prompts-list">
        {displayedPrompts.length === 0 ? (
          <li className="empty-message">No prompts saved yet.</li>
        ) : (
          displayedPrompts.map((prompt) => {
            // Handle possible invalid URL in prompt.origin
            let originHost = "Unknown Origin"
            try {
              originHost = new URL(prompt.origin).hostname
            } catch (e) {
              console.warn("Invalid prompt origin URL:", prompt.origin)
            }
            
            const promptDate = new Date(prompt.timestamp).toLocaleString()

            return (
              <li
                key={prompt.timestamp}
                className="prompt-item"
                data-timestamp={prompt.timestamp}
              >
                <span className="prompt-meta">
                  {`${originHost} - ${promptDate}`}
                </span>
                <p className="prompt-text">{prompt.text}</p>
                <button
                  className="delete-btn"
                  title="Delete prompt"
                  onClick={() => handleDelete(prompt.timestamp)}
                >
                  &times;
                </button>
              </li>
            )
          })
        )}
      </ul>
    </div>
  )
}

export default PopupIndex
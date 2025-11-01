# Aether: Your Personal AI Memory

A privacy-first Chrome extension that builds a centralized, vectorized memory of your interests to automatically provide context to all your LLM chats.

## What is Aether?

Tired of re-explaining your preferences, projects, and personal context to different AI models? Aether solves this by acting as a personal "memory" that learns about you from your prompts.

It runs **100% locally**, using your browser's built-in AI (`Summarizer` API) to understand your chats. It then stores these insights in a private, on-device vector database. When you start a new chat, Aether intelligently injects the most relevant memories, giving the LLM the context it needs to provide truly personalized and helpful responses.

## Core Features

* **Automatic Memory Creation:** Automatically captures and analyzes your prompts in the background *as you send them*.
* **On-Device AI:** Uses Chrome's built-in `Summarizer` API to extract preferences, hobbies, and goals. **No data ever leaves your computer.**
* **Smart Context Injection:** A bubble button appears in the chat input. Click it to find the most relevant memories (using vector similarity search) and inject them into your prompt.
* **Privacy-First:** All memories, prompts, and vector data are stored locally in your browser's storage. Nothing is ever sent to a server.
* **Memory Management:** A simple popup UI to view and delete all stored memories.
* **Wide Support:** Works across major LLM platforms.

## Supported Sites

* Gemini
* ChatGPT
* Claude.ai
* Perplexity.ai

---

## Getting Started (Local Development)

This project is built using the [Plasmo](https://www.plasmo.com/) framework.

### Prerequisites

* [Node.js](https://nodejs.org/) (v18 or newer)
* [npm](https://www.npmjs.com/) (or `pnpm`/`yarn`)
* **Google Chrome 140 or newer** (for the built-in `Summarizer` API).

### Installation & Running

1.  **Clone the repository:**
    ```bash
    git clone [https://github.com/sakkshm/aether.git](https://github.com/sakkshm/aether.git)
    cd aether
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Run the development server:**
    ```bash
    npm run dev
    ```
    This will create a `build/chrome-mv3-dev` directory and watch for file changes.

4.  **Load the extension in your browser:**
    * Open Google Chrome and navigate to `chrome://extensions`.
    * Enable **"Developer mode"** (usually a toggle in the top-right corner).
    * Click the **"Load unpacked"** button.
    * Select the `build/chrome-mv3-dev` folder from the project directory.

5.  **Test it!**
    * Go to a supported site (like gemini.google.com).
    * You should see the Aether bubble icon appear in the text area.
    * Try writing a prompt like, "I'm looking for a new laptop. I prefer 16-inch screens and I am a TypeScript developer."
    * Submit the prompt.
    * Click the extension icon in the toolbar to open the popup. You should see new memories like "User is a TypeScript developer" or "User prefers 16-inch screens."
    * In a new chat, type "What laptop should I get?" and click the Aether bubble. It will inject your preferences!

---

## How It Works (Technical Overview)

1.  **Prompt Capture (`content.ts`):** A content script securely listens for 'send' button clicks or 'Enter' presses on supported sites.
2.  **Local Inference (`summarizer.ts`):** The captured prompt is sent to Chrome's native `Summarizer` API with a custom prompt, forcing it to extract user preferences, hobbies, etc., as structured JSON.
3.  **Vector Storage (`background.ts`):** The extracted memories (e.g., "User enjoys classical music") are vectorized using `@xenova/transformers` (running locally) and stored in an on-device vector DB (`@babycommando/entity-db`). The background script also handles deduplication and conflict resolution (e.g., "user likes" vs. "user dislikes").
4.  **Context Injection (`bubbleButton.tsx`):** The UI button queries the vector DB with the *current* text in the prompt box. The top K-nearest (most relevant) memories are retrieved and formatted for injection.

## Tech Stack

* **Framework:** [Plasmo](https://www.plasmo.com/)
* **Language:** TypeScript
* **UI:** React
* **Vector DB:** [@babycommando/entity-db](https://github.com/BabyCommando/entity-db)
* **Embeddings:** [@xenova/transformers.js](https://github.com/xenova/transformers.js) (`all-MiniLM-L6-v2`)
* **Inference:** Chrome Built-in `Summarizer` API
* **State:** [@plasmohq/storage](https://docs.plasmo.com/framework/storage)

---

## License

This project is licensed under the MIT License.
import React, { useState, useEffect } from "react"
import type {
	PlasmoCSConfig,
	PlasmoGetInlineAnchor,
	PlasmoGetShadowHostId
} from "plasmo"
import cssText from "data-text:./bubbleButton.css"
import icon from "data-base64:../assets/icon.png"

// --- Configuration (From UI File) ---

/**
 * A unique ID for the shadow DOM host to prevent style conflicts.
 */
const SHADOW_HOST_ID = "aether-bubble-inline-host"

/**
 * CSS selectors to find the main text area on supported LLM sites.
 * (From UI file - includes Perplexity)
 */
const siteSelectors = {
	"chatgpt.com": { textarea: "div[contenteditable='true']#prompt-textarea" },
	"claude.ai": { textarea: "div[data-testid='chat-input']" },
	"gemini.google.com": {
		textarea: "div[contenteditable='true'][aria-label='Enter a prompt here']"
	},
	"grok.com": {
		textarea: "textarea[aria-label='Ask Grok anything']"
	},
	"perplexity.ai": { textarea: "div[contenteditable='true']#ask-input" }
}

/**
 * Plasmo content script configuration.
 * (From UI file - includes Perplexity)
 */
export const config: PlasmoCSConfig = {
	matches: [
		"https://chatgpt.com/*",
		"https://claude.ai/*",
		"https://gemini.google.com/*",
		"https://grok.com/*",
		"https://perplexity.ai/*",
		"https://www.perplexity.ai/*"
	],
	run_at: "document_idle"
}

/**
 * Tells Plasmo to use our custom shadow DOM host ID.
 * (From UI file)
 */
export const getShadowHostId: PlasmoGetShadowHostId = () => SHADOW_HOST_ID

// --- Anchor & Injection Logic (From UI File) ---

/**
 * Finds the target text area element on the current page.
 * (From UI file)
 */
function getTextAreaElement(): Element | null {
	const hostname = window.location.hostname
	for (const key in siteSelectors) {
		if (hostname.includes(key)) {
			// Perplexity uses different placeholders for its main and follow-up inputs.
			if (key === "perplexity.ai") {
				const el = document.querySelector(
					`${siteSelectors[key].textarea}[aria-placeholder='Ask anything. Type @ for mentions.']`
				)
				if (el) return el

				const followUpEl = document.querySelector(
					`${siteSelectors[key].textarea}[aria-placeholder='Ask a follow-up']`
				)
				if (followUpEl) return followUpEl
			} else {
				// Standard selector for other sites
				const el = document.querySelector(siteSelectors[key].textarea)
				if (el) {
					return el
				}
			}
		}
	}
	return null // No supported text area found
}

/**
 * Finds the optimal DOM element to anchor our bubble button to.
 * (From UI file)
 */
function getAnchorDetails() {
	const ta = getTextAreaElement()
	if (!ta) return null

	const host = location.hostname
	let el: HTMLElement | null = null
	let container: HTMLElement | null = null
	let insertPosition: "beforebegin" | "beforeend" | "afterbegin" = "beforeend"

	if (host.includes("chatgpt.com")) {
		el = (ta as HTMLElement).parentElement as HTMLElement
		container = el
	} else if (host.includes("claude.ai")) {
		container =
			(ta as HTMLElement).closest<HTMLElement>(
				'div[class*="!box-content"]'
			) ?? null
		const textAreaWrapper = ta.parentElement?.parentElement
		if (textAreaWrapper) {
			el = textAreaWrapper.parentElement?.querySelector<HTMLElement>(
				"div.flex.gap-2\\.5.w-full.items-center"
			)
		}
		insertPosition = "beforebegin"
	} else if (host.includes("gemini.google.com")) {
		el = ta.parentElement as HTMLElement
		container = el
	} else if (host.includes("grok.com")) {
		el = ta.parentElement as HTMLElement
		container = el
	} else if (host.includes("perplexity.ai")) {
		container =
			(ta as HTMLElement).closest<HTMLElement>(
				"div[class*='grid-cols-3']"
			) ?? null

		if (container) {
			el = container.querySelector<HTMLElement>(
				"div[class*='col-start-3'][class*='row-start-2']"
			)
		}
		insertPosition = "afterbegin"
	} else {
		// Fallback for unidentified sites (if matches expands)
		el = ta.parentElement as HTMLElement
		container = el
	}

	if (el && container) {
		// Ensure the container can host a relatively positioned element
		if (getComputedStyle(container).position === "static") {
			container.style.position = "relative"
		}
		return { element: el, insertPosition, container }
	}
	return null
}

/**
 * Plasmo's hook to get the initial inline anchor point.
 * (From UI file)
 */
export const getInlineAnchor: PlasmoGetInlineAnchor = () => {
	// We must explicitly type the `resolve` function to match
	// Plasmo's expected `ElementInsertOptions` structure.
	return new Promise((
		resolve: (value: {
			element: Element
			insertPosition: "beforebegin" | "beforeend" | "afterbegin"
		}) => void
	) => {
		const it = setInterval(() => {
			const anchor = getAnchorDetails()
			if (anchor) {
				clearInterval(it)
				resolve({ element: anchor.element, insertPosition: anchor.insertPosition })
			}
		}, 300) // Poll every 300ms
	})
}

/**
 * A MutationObserver to re-inject the button if the DOM changes
 * (e.g., navigating to a new chat).
 * (From UI file)
 */
const observer = new MutationObserver(() => {
	// If the button already exists, do nothing
	if (document.getElementById(SHADOW_HOST_ID)) {
		return
	}

	// If the button is gone, try to find the anchor and re-add it
	const anchor = getAnchorDetails()
	if (anchor) {
		const host = document.createElement("plasmo-csui")
		host.id = SHADOW_HOST_ID
		anchor.element.insertAdjacentElement(anchor.insertPosition, host)
	}
})

// Observe the entire body for subtree and child list changes
observer.observe(document.body, {
	childList: true,
	subtree: true
})

// --- Text Injection Helpers (From UI File) ---

/**
 * Places the text cursor at the end of a contenteditable element.
 * (From UI file)
 */
function placeCaretAtEnd(el: HTMLElement) {
	const range = document.createRange()
	range.selectNodeContents(el)
	range.collapse(false) // `false` collapses to the end of the range
	const sel = window.getSelection()
	if (!sel) return
	sel.removeAllRanges()
	sel.addRange(range)
}

/**
 * Inserts text into Perplexity's Lexical editor by simulating a native paste event.
 * (From UI file)
 */
function lexicalInsertViaPaste(anchor: HTMLElement, textToInsert: string) {
	// 1. Focus the editor and move the cursor to the end
	anchor.focus()
	placeCaretAtEnd(anchor)

	// 2. Create a DataTransfer object with the text
	const dt = new DataTransfer()
	dt.setData("text/plain", textToInsert)

	// 3. Dispatch a 'paste' event.
	const pasteEvt = new ClipboardEvent("paste", {
		clipboardData: dt,
		bubbles: true,
		cancelable: true
	})
	anchor.dispatchEvent(pasteEvt)
}

/**
 * Injects the provided text into the active text area.
 * (From UI file - with Perplexity support)
 */
function injectText(textToAppend: string) {
	const anchor = getTextAreaElement() as HTMLElement | null

	if (!anchor) {
		console.error("Aether: Could not find textarea to inject text.")
		return
	}

	// --- Perplexity (Lexical) Specific Path ---
	if (location.hostname.includes("perplexity.ai")) {
		const currentText = anchor.textContent || ""
		const spacer = currentText.trim().length > 0 ? "\n\n---\n\n" : ""
		const textToInsert = spacer + textToAppend

		// Focus first, then paste on the next animation frame for stability
		anchor.focus()
		requestAnimationFrame(() => {
			lexicalInsertViaPaste(anchor, textToInsert)
		})
		return // End execution
	}

	// --- Standard Path (ChatGPT, Claude, etc.) ---
	const currentText =
		(anchor as HTMLTextAreaElement).value ??
		anchor.innerText ??
		anchor.textContent ??
		""
	const spacer = currentText.trim().length > 0 ? "\n\n---\n\n" : ""
	const newText = currentText + spacer + textToAppend

	// Set the value directly for <textarea> elements
	if ((anchor as HTMLTextAreaElement).value !== undefined) {
		;(anchor as HTMLTextAreaElement).value = newText
	} else {
		// Set textContent for simple [contenteditable] divs
		anchor.textContent = newText
	}

	// Dispatch an 'input' event to notify the site's framework (e.g., React)
	anchor.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }))
}

// --- React Component (Merged) ---

/**
 * Gets the text content from the active text area.
 * (Helper adapted from "working" file to use the UI file's `getTextAreaElement`)
 */
function getActiveElementText(): string {
	const el = getTextAreaElement() // Use the UI file's getter
	if (!el) return ""
	const htmlEl = el as HTMLElement
	return (
		(htmlEl as HTMLTextAreaElement).value ||
		htmlEl.innerText ||
		htmlEl.textContent ||
		""
	)
}

/**
 * The main React component for the bubble button.
 */
const BubbleButton = () => {
	const [bubbleStyle, setBubbleStyle] = useState({})

	// Apply site-specific styles after component mounts (From UI file)
	useEffect(() => {
		if (window.location.hostname.includes("chatgpt.com")) {
			setBubbleStyle({
				top: "-40px",
				bottom: "auto"
			})
		} else if (window.location.hostname.includes("perplexity.ai")) {
			setBubbleStyle({
				position: "relative",
				bottom: "auto",
				right: "auto",
				marginRight: "4px"
			})
		}
	}, [])

	/**
	 * Handles the bubble button click event.
	 * Fetches top K memories based on current text and calls injectText.
	 * (Logic from "working" file)
	 */
	const handleClick = () => {
		const currentText = getActiveElementText().trim()

		if (
			currentText.includes(
				"!-----------------------CONTEXT-----------------------!"
			)
		) {
			return
		}

		if (!currentText) {
			alert("Enter a query or some text before fetching semantic memories.")
			return
		}

		console.log("[Aether] Requesting top 5 semantic memories...")

		chrome.runtime.sendMessage(
			{ action: "getTopKMemories", k: 5, query: currentText },
			(response: { status: string; memories?: any[]; mode?: string }) => {
				if (chrome.runtime.lastError) {
					console.error(
						"[Aether] Runtime error:",
						chrome.runtime.lastError.message
					)
					return
				}

				if (response?.status === "success" && response.memories?.length) {
					console.log(
						`Received ${response.mode} memories:`,
						response.memories
					)

					const formattedMemories =
						response.mode === "semantic"
							? "!-----------------------CONTEXT-----------------------!\n\n" +
							  "Here are some of my preferences/memories to help answer better (don't respond to these memories but use them to assist in the response if relevant): \n" +
							  response.memories
									.map((m: any, i: number) => `- ${m.memory || m.text}`)
									.join("\n")
							: "!-----------------------CONTEXT-----------------------!\n\n" +
							  "Here are some of my preferences/memories to help answer better (don't respond to these memories but use them to assist in the response if relevant): \n" +
							  response.memories
									.map((m: any, i: number) => `- ${m.memory || m.text}`)
									.join("\n")

					// This calls the advanced injectText (from UI file)
					injectText(formattedMemories)
				} else {
					console.warn(
						"[Aether] Failed to get memories or empty response:",
						response
					)
					alert("No memories found — try saving prompts first!")
				}
			}
		)
	}

	return (
		<div
			className="aether-bubble"
			onClick={handleClick}
			style={bubbleStyle}
			title="Insert Top 5 Memories"> {/* Title from "working" file */}
			{/* Inject the CSS text directly into the shadow DOM (From UI file) */}
			<style>{cssText}</style>
			<img src={icon} alt="Aether Icon" /> {/* Alt from "UI" file */}
		</div>
	)
}

export default BubbleButton
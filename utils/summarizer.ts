// Temporary declaration for the Summarizer API
declare const Summarizer: {
  availability(): Promise<"unavailable" | "downloadable" | "downloading" | "available">;
  create(options?: any): Promise<any>;
};


export enum AvailabilityStatus {
  UNAVAILABLE = "unavailable",
  DOWNLOADABLE = "downloadable",
  DOWNLOADING = "downloading",
  AVAILABLE = "available"
}

export function checkSupport(): boolean {
  return typeof Summarizer !== "undefined";
}

export async function checkAvailabilityStatus(): Promise<AvailabilityStatus> {
  if (!checkSupport()) {
    return AvailabilityStatus.UNAVAILABLE;
  }

  try {
    const availability = await Summarizer.availability();
    switch (availability) {
      case "downloadable": return AvailabilityStatus.DOWNLOADABLE;
      case "downloading":  return AvailabilityStatus.DOWNLOADING;
      case "available":    return AvailabilityStatus.AVAILABLE;
      default:             return AvailabilityStatus.UNAVAILABLE;
    }
  } catch {
    return AvailabilityStatus.UNAVAILABLE;
  }
}

export async function downloadModel(
  streamDownloadStatus: (progress: number) => void
): Promise<void> {
  if (!checkSupport()) {
    throw new Error("Summarizer API not supported in this browser.");
  }

  await Summarizer.create({
    monitor(m: any) {
      m.addEventListener("downloadprogress", (e: any) => {
        streamDownloadStatus(e.loaded);
      });
    }
  });
}

export async function createSummarizer(): Promise<any> {
  const availability = await checkAvailabilityStatus();

  if (availability === AvailabilityStatus.UNAVAILABLE) {
    throw new Error("Summarizer API not supported or unavailable in this browser.");
  }

  const summarizer = await Summarizer.create({
    type: "tldr",
    length: "long",
    format: "plain-text",
    sharedContext: `
      You are an LLM that extracts structured "memory" data about a user.
      From the input text, identify **all** user preferences, dislikes, hobbies, traits, beliefs, and goals.
      Output them as a **JSON array**, where each object represents one memory item.

      Each object must include:
      - "type": One of ["preference", "dislike", "hobby", "trait", "belief", "goal"]
      - "statement": A natural-language sentence starting with "User ..." that expresses the fact in certain terms with enough detail for it to be specific.
      - "tags": [ "string", ... ]  // topic tags, e.g. ["music", "food", "coding"]

      Example output format:
      [
        {
          "type": "preference",
          "statement": "User enjoys classical music.",
          "tags": ["music", "aesthetics"]
        },
        {
          "type": "trait",
          "statement": "User is analytical and detail-oriented.",
          "tags": ["personality", "workstyle"]
        }
      ]

      STRICT RULES:
    - Output ONLY valid JSON.
    - Do NOT wrap JSON in code fences or explanations.
    - Do NOT include text before or after the JSON.
    - If no memories are found, output [].
    `
  });

  if (!summarizer) {
    throw new Error("Unable to create summarizer instance.");
  }

  return summarizer;
}

export async function summarizePrompt(
  prompt: string,
  summarizer: any
): Promise<any[]> {
  try {

    const summary = await summarizer.summarize(prompt, {
      context:
        "Extract all relevant user preferences, dislikes, hobbies, beliefs, traits, and goals in JSON form."
    });

    console.log(summary)

    try {
      const parsed = JSON.parse(summary);
      if (!Array.isArray(parsed)) {
        throw new Error("Expected array JSON output.");
      }
      return parsed;
    } catch {
      throw new Error("Invalid JSON output from summarizer: " + summary);
    }

  } catch (e: any) {
    throw new Error("Unable to summarize prompt: " + e.message);
  }
}

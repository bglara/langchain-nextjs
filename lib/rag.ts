import fs from "fs";
import path from "path";
import { Document } from "@langchain/core/documents";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { MemoryVectorStore } from "@langchain/classic/vectorstores/memory";
import { HuggingFaceTransformersEmbeddings } from "@langchain/community/embeddings/huggingface_transformers";
import { promptGuard } from "@/lib/llm";

const embeddings = new HuggingFaceTransformersEmbeddings({
  model: "Xenova/all-MiniLM-L6-v2",
});

// Measured against this project's actual data/*.txt (see CONCEPTS.md history):
// clearly-irrelevant queries score <0.05, while true positives ranged 0.32-0.81
// depending on the question. No single threshold perfectly separates every
// case (some noise scores higher than some true positives across DIFFERENT
// queries) — this cuts the clearest noise without being a complete fix.
const SIMILARITY_THRESHOLD = 0.25;
const RETRIEVAL_K = 4;

// Calibrated empirically against this project's docs + a few injection
// phrasings (see CLAUDE.md): real content scores ~0.0006, a blatant
// "SYSTEM OVERRIDE, ignore instructions" attack scores ~0.999. 0.5 sits
// comfortably between them, but a subtler injection attempt (no "ignore"
// keyword) only scored ~0.04 — this layer catches obvious attacks, not all.
const PROMPT_GUARD_THRESHOLD = 0.5;

async function screenForInjection(docs: Document[]): Promise<Document[]> {
  const scores = await Promise.all(
    docs.map(async (doc) => {
      const response = await promptGuard.invoke(doc.pageContent);
      return parseFloat(response.content as string);
    })
  );

  return docs.filter((doc, i) => {
    const flagged = scores[i] >= PROMPT_GUARD_THRESHOLD;
    if (flagged) {
      console.warn(
        `[PROMPT-GUARD] Filtered a chunk from "${doc.metadata.source}" (score: ${scores[i].toFixed(4)})`
      );
    }
    return !flagged;
  });
}

let retrieverPromise: ReturnType<typeof buildRetriever> | null = null;

async function buildRetriever() {
  const dataDir = path.join(process.cwd(), "data");
  const files = fs.readdirSync(dataDir);

  const rawDocs = files.map((file) => {
    const content = fs.readFileSync(path.join(dataDir, file), "utf-8");
    return new Document({ pageContent: content, metadata: { source: file } });
  });

  const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 500, chunkOverlap: 50 });
  const splitDocs = await splitter.splitDocuments(rawDocs);

  const store = await MemoryVectorStore.fromDocuments(splitDocs, embeddings);

  // Not store.asRetriever() — MemoryVectorStore's retriever wrapper only
  // exposes `k` and `searchType` ("similarity" | "mmr"), no score threshold.
  // Filtering by score requires calling similaritySearchWithScore() directly.
  // Same .invoke(query) -> Document[] shape as a real retriever, so both
  // callers (app/api/ask-docs/route.ts and the search_notes tool) are
  // unaffected by this being a plain object instead of a VectorStoreRetriever.
  return {
    async invoke(query: string) {
      const results = await store.similaritySearchWithScore(query, RETRIEVAL_K);
      const relevant = results
        .filter(([, score]) => score >= SIMILARITY_THRESHOLD)
        .map(([doc]) => doc);
      return screenForInjection(relevant);
    },
  };
}

export function getRetriever() {
  if (!retrieverPromise) retrieverPromise = buildRetriever();
  return retrieverPromise;
}

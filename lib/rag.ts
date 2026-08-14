import fs from "fs";
import path from "path";
import { z } from "zod";
import { Document } from "@langchain/core/documents";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { MemoryVectorStore } from "@langchain/classic/vectorstores/memory";
import { HuggingFaceTransformersEmbeddings } from "@langchain/community/embeddings/huggingface_transformers";
import { llm, llmFallback, promptGuard } from "@/lib/llm";

const embeddings = new HuggingFaceTransformersEmbeddings({
  model: "Xenova/all-MiniLM-L6-v2",
});

const SIMILARITY_THRESHOLD = 0.25;
const CANDIDATE_K = 8;
const FINAL_K = 4;
const PROMPT_GUARD_THRESHOLD = 0.5;
const RRF_K = 60;
const BM25_K1 = 1.5;
const BM25_B = 0.75;

function tokenize(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

/**
 * In-memory BM25 (Okapi). Keyword search: good at exact tokens like product
 * names and dollar amounts that embedding similarity can blur.
 */
function bm25Search(docs: Document[], query: string, k: number): Document[] {
  const docsTokens = docs.map((d) => tokenize(d.pageContent));
  const avgdl = docsTokens.reduce((sum, tokens) => sum + tokens.length, 0) / docsTokens.length || 1;
  const df = new Map<string, number>();
  for (const tokens of docsTokens) {
    for (const term of new Set(tokens)) {
      df.set(term, (df.get(term) ?? 0) + 1);
    }
  }

  const qTokens = tokenize(query);
  const N = docs.length;
  const scored = docs.map((doc, i) => {
    const tokens = docsTokens[i];
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    let score = 0;
    for (const term of qTokens) {
      const n = df.get(term) ?? 0;
      if (n === 0) continue;
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      const f = tf.get(term) ?? 0;
      const dl = tokens.length;
      score +=
        (idf * (f * (BM25_K1 + 1))) /
        (f + BM25_K1 * (1 - BM25_B + (BM25_B * dl) / avgdl));
    }
    return { doc, score };
  });

  return scored
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((row) => row.doc);
}

/**
 * Reciprocal Rank Fusion: combine two ranked lists without needing comparable
 * scores. Rank 1 in either list contributes 1/(60+1), rank 2 contributes
 * 1/(60+2), and so on. Chunks that appear in BOTH lists rise to the top.
 */
function fuseRrf(rankings: Document[][], k: number): Document[] {
  const scores = new Map<string, { doc: Document; score: number }>();
  for (const ranking of rankings) {
    ranking.forEach((doc, index) => {
      const key = doc.pageContent;
      const add = 1 / (RRF_K + index + 1);
      const prev = scores.get(key);
      if (prev) prev.score += add;
      else scores.set(key, { doc, score: add });
    });
  }
  return [...scores.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((row) => row.doc);
}

const rerankSchema = z.object({
  orderedIndices: z
    .array(z.union([z.number(), z.string()]))
    .describe(
      "Separate integer indices, most relevant first, e.g. [2, 0, 1]. " +
        "Never concatenate digits into one string.",
    ),
});

const reranker = llm
  .withStructuredOutput(rerankSchema)
  .withRetry({ stopAfterAttempt: 2 })
  .withFallbacks([
    llmFallback.withStructuredOutput(rerankSchema).withRetry({ stopAfterAttempt: 1 }),
  ]);

function normalizeIndices(raw: Array<number | string>, docCount: number): number[] {
  const out: number[] = [];
  for (const item of raw) {
    if (typeof item === "number" && Number.isInteger(item)) {
      out.push(item);
      continue;
    }
    if (typeof item === "string") {
      // Groq sometimes emits "02134567" instead of [0, 2, 1, 3, ...].
      if (/^\d+$/.test(item) && item.length > 1 && docCount <= 10) {
        for (const ch of item) out.push(Number(ch));
        continue;
      }
      const n = Number(item);
      if (Number.isInteger(n)) out.push(n);
    }
  }
  return out;
}

async function rerank(query: string, docs: Document[], keep: number): Promise<Document[]> {
  if (docs.length <= keep) return docs;

  const listed = docs
    .map((d, i) => `[${i}] (${d.metadata.source ?? "unknown"})\n${d.pageContent.slice(0, 400)}`)
    .join("\n\n");

  let raw: Array<number | string> = [];
  try {
    const result = await reranker.invoke(
      `Rank these document chunks by relevance to the question. ` +
        `Return a JSON array of separate integers, like [2, 0, 1] — one index per chunk. ` +
        `Do not glue indices into a single string.\n\n` +
        `Question: ${query}\n\nChunks:\n${listed}`,
    );
    raw = result.orderedIndices;
  } catch (error) {
    // Cheap retrieval (BM25 + MMR + RRF) already ranked `docs`. A malformed
    // structured-output payload must not 500 the whole /api/agent request.
    console.warn("[RERANK] Falling back to fused ranking:", (error as Error).message);
    return docs.slice(0, keep);
  }

  const seen = new Set<number>();
  const ordered: Document[] = [];
  for (const i of normalizeIndices(raw, docs.length)) {
    if (i >= 0 && i < docs.length && !seen.has(i)) {
      seen.add(i);
      ordered.push(docs[i]);
    }
  }
  for (let i = 0; i < docs.length && ordered.length < keep; i++) {
    if (!seen.has(i)) ordered.push(docs[i]);
  }
  return ordered.slice(0, keep);
}

async function screenForInjection(docs: Document[]): Promise<Document[]> {
  const scores = await Promise.all(
    docs.map(async (doc) => {
      const response = await promptGuard.invoke(doc.pageContent);
      return parseFloat(response.content as string);
    }),
  );

  return docs.filter((doc, i) => {
    const flagged = scores[i] >= PROMPT_GUARD_THRESHOLD;
    if (flagged) {
      console.warn(
        `[PROMPT-GUARD] Filtered a chunk from "${doc.metadata.source}" (score: ${scores[i].toFixed(4)})`,
      );
    }
    return !flagged;
  });
}

let retrieverPromise: ReturnType<typeof buildRetriever> | null = null;

async function buildRetriever() {
  const dataDir = path.join(process.cwd(), "data");
  const files = fs.readdirSync(dataDir).filter((file) => file.endsWith(".txt"));

  const rawDocs = files.map((file) => {
    const content = fs.readFileSync(path.join(dataDir, file), "utf-8");
    return new Document({ pageContent: content, metadata: { source: file } });
  });

  const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 500, chunkOverlap: 50 });
  const splitDocs = await splitter.splitDocuments(rawDocs);
  const store = await MemoryVectorStore.fromDocuments(splitDocs, embeddings);

  return {
    async invoke(query: string) {
      // 1. Keyword branch (BM25).
      const keywordHits = bm25Search(splitDocs, query, CANDIDATE_K);

      // 2. Vector branch: MMR for diversity, then drop chunks below the
      //    cosine threshold (MMR itself does not return scores).
      const mmrHits = await store.maxMarginalRelevanceSearch(query, {
        k: CANDIDATE_K,
        fetchK: CANDIDATE_K * 2,
        lambda: 0.5,
      });
      const scored = await store.similaritySearchWithScore(query, CANDIDATE_K * 2);
      const aboveThreshold = new Set(
        scored
          .filter(([, score]) => score >= SIMILARITY_THRESHOLD)
          .map(([doc]) => doc.pageContent),
      );
      const vectorHits = mmrHits.filter((doc) => aboveThreshold.has(doc.pageContent));

      // 3. Fuse the two ranked lists.
      const fused = fuseRrf([vectorHits, keywordHits], CANDIDATE_K);

      // 4. Cross-chunk re-rank with the chat model; keep FINAL_K.
      const reranked = await rerank(query, fused, FINAL_K);

      // 5. Safety last: Prompt Guard is not a relevance filter.
      return screenForInjection(reranked);
    },
  };
}

export function getRetriever() {
  if (!retrieverPromise) retrieverPromise = buildRetriever();
  return retrieverPromise;
}

import fs from "fs";
import path from "path";
import { Document } from "@langchain/core/documents";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { MemoryVectorStore } from "@langchain/classic/vectorstores/memory";
import { HuggingFaceTransformersEmbeddings } from "@langchain/community/embeddings/huggingface_transformers";

const embeddings = new HuggingFaceTransformersEmbeddings({
  model: "Xenova/all-MiniLM-L6-v2",
});

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
  return store.asRetriever();
}

export function getRetriever() {
  if (!retrieverPromise) retrieverPromise = buildRetriever();
  return retrieverPromise;
}

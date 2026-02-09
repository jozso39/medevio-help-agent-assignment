import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';
import { MDocument } from '@mastra/rag';
import { embedMany } from 'ai';
import { openai } from '@ai-sdk/openai';
import { libsqlVector, MEDEVIO_DOCS_INDEX, EMBEDDING_DIMENSION } from '../vector-store';

const DOCS_DIR = path.join(process.cwd(), 'output', 'docs');

// Step 1: Discover all .md files in the docs directory
const discoverFiles = createStep({
  id: 'discover-files',
  description: 'Lists all Markdown files in the docs directory',
  inputSchema: z.object({}),
  outputSchema: z.object({
    files: z.array(z.string()),
  }),
  execute: async () => {
    try {
      await fs.access(DOCS_DIR);
    } catch {
      throw new Error(
        `Docs directory not found: ${DOCS_DIR}. ` +
        `Run the docs scraper workflow first, or place Markdown files in src/mastra/public/output/docs/.`
      );
    }
    const entries = await fs.readdir(DOCS_DIR);
    const files = entries.filter(f => f.endsWith('.md'));
    if (files.length === 0) {
      throw new Error(
        `No Markdown files found in ${DOCS_DIR}. ` +
        `Run the docs scraper workflow first to populate the docs directory.`
      );
    }
    console.log(`Found ${files.length} Markdown files in ${DOCS_DIR}`);
    return { files };
  },
});

// Step 2: Chunk and embed all files into the vector store
const chunkAndEmbed = createStep({
  id: 'chunk-and-embed',
  description: 'Chunks Markdown files, embeds them, and upserts into the LibSQL vector store',
  inputSchema: z.object({
    files: z.array(z.string()),
  }),
  outputSchema: z.object({
    totalChunks: z.number(),
    totalEmbedded: z.number(),
  }),
  execute: async ({ inputData }) => {
    if (!inputData) {
      throw new Error('Input data not found');
    }

    const { files } = inputData;
    if (files.length === 0) {
      return { totalChunks: 0, totalEmbedded: 0 };
    }

    const embeddingModel = openai.embedding('text-embedding-3-small');

    // Create or truncate the index (full re-index each run)
    const existingIndexes = await libsqlVector.listIndexes();
    if (existingIndexes.includes(MEDEVIO_DOCS_INDEX)) {
      await libsqlVector.truncateIndex({ indexName: MEDEVIO_DOCS_INDEX });
    } else {
      await libsqlVector.createIndex({
        indexName: MEDEVIO_DOCS_INDEX,
        dimension: EMBEDDING_DIMENSION,
        metric: 'cosine',
      });
    }

    let totalChunks = 0;
    let totalEmbedded = 0;
    const BATCH_SIZE = 10;

    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      const batch = files.slice(i, i + BATCH_SIZE);
      const allChunkTexts: string[] = [];
      const allChunkMetadata: Record<string, any>[] = [];

      for (const filename of batch) {
        const filepath = path.join(DOCS_DIR, filename);
        const content = await fs.readFile(filepath, 'utf-8');

        // Strip YAML frontmatter and extract metadata
        let markdown = content;
        let title = '';
        let source = '';

        const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n\n?([\s\S]*)$/);
        if (frontmatterMatch) {
          const frontmatter = frontmatterMatch[1];
          markdown = frontmatterMatch[2];
          const titleMatch = frontmatter.match(/title:\s*"(.+?)"/);
          const sourceMatch = frontmatter.match(/source:\s*"(.+?)"/);
          if (titleMatch) title = titleMatch[1];
          if (sourceMatch) source = sourceMatch[1];
        }

        if (!markdown.trim()) continue;

        // Chunk with markdown strategy
        const doc = MDocument.fromMarkdown(markdown);
        const chunks = await doc.chunk({
          strategy: 'markdown',
          headers: [['#', 'heading1'], ['##', 'heading2'], ['###', 'heading3']],
        });

        for (const chunk of chunks) {
          const text = typeof chunk === 'string' ? chunk : chunk.text;
          if (!text.trim()) continue;
          allChunkTexts.push(text);
          allChunkMetadata.push({
            text,
            source,
            title,
            filename,
            ...(typeof chunk !== 'string' && chunk.metadata ? chunk.metadata : {}),
          });
        }
      }

      totalChunks += allChunkTexts.length;

      if (allChunkTexts.length === 0) continue;

      // Embed all chunks in this batch
      const { embeddings } = await embedMany({
        model: embeddingModel,
        values: allChunkTexts,
      });

      // Upsert into vector store (separate arrays for vectors, metadata, ids)
      const ids = embeddings.map((_, idx) => `${allChunkMetadata[idx].filename}-${idx}`);

      await libsqlVector.upsert({
        indexName: MEDEVIO_DOCS_INDEX,
        vectors: embeddings as number[][],
        metadata: allChunkMetadata,
        ids,
      });

      totalEmbedded += embeddings.length;
      console.log(`Embedded batch ${Math.floor(i / BATCH_SIZE) + 1}: ${embeddings.length} chunks`);
    }

    console.log(`Embedding complete: ${totalChunks} chunks, ${totalEmbedded} embedded`);
    return { totalChunks, totalEmbedded };
  },
});

const embedDocsWorkflow = createWorkflow({
  id: 'embed-docs-workflow',
  inputSchema: z.object({}),
  outputSchema: z.object({
    totalChunks: z.number(),
    totalEmbedded: z.number(),
  }),
})
  .then(discoverFiles)
  .then(chunkAndEmbed);

embedDocsWorkflow.commit();

export { embedDocsWorkflow };

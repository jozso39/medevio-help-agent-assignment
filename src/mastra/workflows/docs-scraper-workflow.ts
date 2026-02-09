import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import * as cheerio from 'cheerio';
import TurndownService from 'turndown';
import * as fs from 'fs/promises';
import * as path from 'path';
import { MDocument } from '@mastra/rag';
import { embedMany } from 'ai';
import { openai } from '@ai-sdk/openai';
import { libsqlVector, MEDEVIO_DOCS_INDEX, EMBEDDING_DIMENSION } from '../vector-store';

const DEFAULT_INDEX_URLS = [
  'https://napoveda.medevio.cz/support/solutions/folders/204000127935',
  'https://napoveda.medevio.cz/support/solutions/folders/204000127921',
  'https://napoveda.medevio.cz/support/solutions/folders/204000127922',
  'https://napoveda.medevio.cz/support/solutions/folders/204000127938',
  'https://napoveda.medevio.cz/support/solutions/folders/204000127986',
  'https://napoveda.medevio.cz/support/solutions/folders/204000127926',
  'https://napoveda.medevio.cz/support/solutions/folders/204000127928',
  'https://napoveda.medevio.cz/support/solutions/folders/204000127923',
  'https://napoveda.medevio.cz/support/solutions/folders/204000127924',
  'https://napoveda.medevio.cz/support/solutions/folders/204000127939',
  'https://napoveda.medevio.cz/support/solutions/folders/204000127925',
  'https://napoveda.medevio.cz/support/solutions/folders/204000127927',
  'https://napoveda.medevio.cz/support/solutions/folders/204000127929',
  'https://napoveda.medevio.cz/support/solutions/folders/204000127930',
];

// Helper function to sanitize filename
function sanitizeFilename(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .replace(/[^a-z0-9]+/g, '-') // Replace non-alphanumeric with hyphens
    .replace(/^-+|-+$/g, '') // Trim leading/trailing hyphens
    .slice(0, 100); // Limit length
}

// Helper function to add delay
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Step 1: Pass through the URLs array (required for foreach)
const prepareUrls = createStep({
  id: 'prepare-urls',
  description: 'Prepares the array of index URLs for parallel processing',
  inputSchema: z.object({
    indexUrls: z.array(z.string()).default(DEFAULT_INDEX_URLS).describe('Array of index page URLs to scrape'),
  }),
  outputSchema: z.array(z.string()),
  execute: async ({ inputData }) => {
    if (!inputData) {
      throw new Error('Input data not found');
    }
    return inputData.indexUrls;
  },
});

// Step 2: Process a single index URL (fetches links + processes articles)
const processIndexUrl = createStep({
  id: 'process-index-url',
  description: 'Fetches an index page, extracts article links, and processes all articles',
  inputSchema: z.string(),
  outputSchema: z.object({
    indexUrl: z.string(),
    processed: z.number(),
    files: z.array(z.string()),
  }),
  execute: async ({ inputData: indexUrl }) => {
    if (!indexUrl) {
      throw new Error('Index URL not provided');
    }

    // Parse base URL
    const parsedUrl = new URL(indexUrl);
    const baseUrl = `${parsedUrl.protocol}//${parsedUrl.host}`;

    // Fetch index page
    const indexResponse = await fetch(indexUrl);
    if (!indexResponse.ok) {
      throw new Error(`Failed to fetch index page: ${indexResponse.status} ${indexResponse.statusText}`);
    }

    const indexHtml = await indexResponse.text();
    const $index = cheerio.load(indexHtml);

    // Extract article links
    const links: { url: string; title: string }[] = [];

    $index('a.row').each((_, element) => {
      const href = $index(element).attr('href');
      const title = $index(element).find('.col-md-8 .line-clamp-2').text().trim();

      if (href && title && href.includes('/support/solutions/articles/')) {
        const fullUrl = href.startsWith('http') ? href : `${baseUrl}${href}`;
        links.push({ url: fullUrl, title });
      }
    });

    if (links.length === 0) {
      console.warn(`No article links found on index page: ${indexUrl}`);
      return {
        indexUrl,
        processed: 0,
        files: [],
      };
    }

    console.log(`Found ${links.length} articles on: ${indexUrl}`);

    // Setup turndown service
    const turndownService = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
    });

    turndownService.addRule('images', {
      filter: 'img',
      replacement: (_, node) => {
        const img = node as HTMLImageElement;
        const alt = img.getAttribute('alt') || '';
        const src = img.getAttribute('src') || '';
        const title = img.getAttribute('title') || '';
        const titlePart = title ? ` "${title}"` : '';
        return src ? `![${alt}](${src}${titlePart})` : '';
      },
    });

    // Create output directory
    const outputDir = path.join(process.cwd(), 'output', 'docs');
    await fs.mkdir(outputDir, { recursive: true });

    const files: string[] = [];
    let processed = 0;

    // Process each article
    for (const link of links) {
      try {
        // Add delay to avoid overwhelming the server
        if (processed > 0) {
          await delay(500);
        }

        const response = await fetch(link.url);
        if (!response.ok) {
          console.error(`Failed to fetch ${link.url}: ${response.status}`);
          continue;
        }

        const html = await response.text();
        const $ = cheerio.load(html);

        // Extract the main content
        const contentElement = $('.fw-content.fw-content--single-article');
        if (contentElement.length === 0) {
          console.error(`Content not found for ${link.url}`);
          continue;
        }

        // Remove unwanted elements
        contentElement.find('script, style, noscript').remove();
        contentElement.find('[style]').removeAttr('style');

        // Get the cleaned HTML
        const contentHtml = contentElement.html();
        if (!contentHtml) {
          console.error(`Empty content for ${link.url}`);
          continue;
        }

        // Convert to Markdown
        const markdown = turndownService.turndown(contentHtml);

        // Create frontmatter
        const frontmatter = `---
title: "${link.title.replace(/"/g, '\\"')}"
source: "${link.url}"
scraped_at: "${new Date().toISOString()}"
---

`;

        // Generate filename and save
        const filename = `${sanitizeFilename(link.title)}.md`;
        const filepath = path.join(outputDir, filename);

        await fs.writeFile(filepath, frontmatter + markdown, 'utf-8');

        files.push(filename);
        processed++;

        console.log(`Processed: ${link.title}`);
      } catch (error) {
        console.error(`Error processing ${link.url}:`, error);
      }
    }

    return {
      indexUrl,
      processed,
      files,
    };
  },
});

// Step 3: Aggregate results from all URLs
const aggregateResults = createStep({
  id: 'aggregate-results',
  description: 'Combines results from all processed index URLs',
  inputSchema: z.array(
    z.object({
      indexUrl: z.string(),
      processed: z.number(),
      files: z.array(z.string()),
    })
  ),
  outputSchema: z.object({
    totalProcessed: z.number(),
    allFiles: z.array(z.string()),
  }),
  execute: async ({ inputData: results }) => {
    if (!results) {
      throw new Error('Results not found');
    }

    return {
      totalProcessed: results.reduce((sum, r) => sum + r.processed, 0),
      allFiles: results.flatMap(r => r.files),
    };
  },
});

// Step 4: Chunk scraped markdown files, embed, and upsert into vector store
const chunkAndEmbed = createStep({
  id: 'chunk-and-embed',
  description: 'Chunks scraped Markdown files, embeds them, and upserts into the LibSQL vector store',
  inputSchema: z.object({
    totalProcessed: z.number(),
    allFiles: z.array(z.string()),
  }),
  outputSchema: z.object({
    totalChunks: z.number(),
    totalEmbedded: z.number(),
  }),
  execute: async ({ inputData }) => {
    if (!inputData) {
      throw new Error('Input data not found');
    }

    const { allFiles } = inputData;
    if (allFiles.length === 0) {
      return { totalChunks: 0, totalEmbedded: 0 };
    }

    const outputDir = path.join(process.cwd(), 'output', 'docs');
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

    for (let i = 0; i < allFiles.length; i += BATCH_SIZE) {
      const batch = allFiles.slice(i, i + BATCH_SIZE);
      const allChunkTexts: string[] = [];
      const allChunkMetadata: Record<string, any>[] = [];

      for (const filename of batch) {
        const filepath = path.join(outputDir, filename);
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

      const { embeddings } = await embedMany({
        model: embeddingModel,
        values: allChunkTexts,
      });

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

// Workflow: scrape → aggregate → embed
const docsScraperWorkflow = createWorkflow({
  id: 'docs-scraper-workflow',
  inputSchema: z.object({
    indexUrls: z.array(z.string()).default(DEFAULT_INDEX_URLS).describe('Array of documentation index page URLs'),
  }),
  outputSchema: z.object({
    totalChunks: z.number(),
    totalEmbedded: z.number(),
  }),
})
  .then(prepareUrls)
  .foreach(processIndexUrl, { concurrency: 2 })
  .then(aggregateResults)
  .then(chunkAndEmbed);

docsScraperWorkflow.commit();

export { docsScraperWorkflow };

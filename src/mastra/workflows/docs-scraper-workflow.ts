import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import * as cheerio from 'cheerio';
import TurndownService from 'turndown';
import * as fs from 'fs/promises';
import * as path from 'path';

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
    indexUrls: z.array(z.string()).describe('Array of index page URLs to scrape'),
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

// Workflow with foreach
const docsScraperWorkflow = createWorkflow({
  id: 'docs-scraper-workflow',
  inputSchema: z.object({
    indexUrls: z.array(z.string()).describe('Array of documentation index page URLs'),
  }),
  outputSchema: z.object({
    totalProcessed: z.number(),
    allFiles: z.array(z.string()),
  }),
})
  .then(prepareUrls)
  .foreach(processIndexUrl, { concurrency: 2 })
  .then(aggregateResults);

docsScraperWorkflow.commit();

export { docsScraperWorkflow };

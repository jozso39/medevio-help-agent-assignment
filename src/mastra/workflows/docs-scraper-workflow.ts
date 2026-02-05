import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import * as cheerio from 'cheerio';
import TurndownService from 'turndown';
import * as fs from 'fs/promises';
import * as path from 'path';

const linkSchema = z.object({
  url: z.string(),
  title: z.string(),
});

const linksArraySchema = z.array(linkSchema);

// Step 1: Fetch index page and extract article links
const fetchArticleLinks = createStep({
  id: 'fetch-article-links',
  description: 'Fetches the index page and extracts all article links',
  inputSchema: z.object({
    indexUrl: z.string().describe('The URL of the index page to scrape'),
    baseUrl: z.string().describe('The base URL for resolving relative links'),
  }),
  outputSchema: z.object({
    links: linksArraySchema,
    baseUrl: z.string(),
  }),
  execute: async ({ inputData }) => {
    if (!inputData) {
      throw new Error('Input data not found');
    }

    const response = await fetch(inputData.indexUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch index page: ${response.status} ${response.statusText}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const links: { url: string; title: string }[] = [];

    // Find all article links in the folder listing
    $('a.c-link').each((_, element) => {
      const href = $(element).attr('href');
      const title = $(element).text().trim();

      if (href && title && href.includes('/support/solutions/articles/')) {
        const fullUrl = href.startsWith('http') ? href : `${inputData.baseUrl}${href}`;
        links.push({ url: fullUrl, title });
      }
    });

    if (links.length === 0) {
      throw new Error('No article links found on the index page');
    }

    return {
      links,
      baseUrl: inputData.baseUrl,
    };
  },
});

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

// Step 2: Process all articles (fetch, convert, save)
const processArticles = createStep({
  id: 'process-articles',
  description: 'Fetches each article, converts to Markdown, and saves to files',
  inputSchema: z.object({
    links: linksArraySchema,
    baseUrl: z.string(),
  }),
  outputSchema: z.object({
    processed: z.number(),
    files: z.array(z.string()),
  }),
  execute: async ({ inputData }) => {
    if (!inputData) {
      throw new Error('Input data not found');
    }

    const turndownService = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
    });

    // Configure turndown to handle images better
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

    for (const link of inputData.links) {
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

        // Remove inline styles
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
      processed,
      files,
    };
  },
});

const docsScraperWorkflow = createWorkflow({
  id: 'docs-scraper-workflow',
  inputSchema: z.object({
    indexUrl: z.string().describe('The URL of the documentation index page'),
    baseUrl: z.string().describe('The base URL for resolving relative links'),
  }),
  outputSchema: z.object({
    processed: z.number(),
    files: z.array(z.string()),
  }),
})
  .then(fetchArticleLinks)
  .then(processArticles);

docsScraperWorkflow.commit();

export { docsScraperWorkflow };

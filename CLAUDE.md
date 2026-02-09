# CLAUDE.md

## Project Overview

Mastra AI project (TypeScript) with two main capabilities:
1. **Medevio Help Agent** - Czech-language internal assistant for Medevio employees (patient-doctor communication app) with ClickUp task management and RAG-powered knowledge search
2. **Docs scraper workflow** - Bulk scraping Medevio help documentation to Markdown files
3. **Embed docs workflow** - Chunks and embeds Markdown docs from `src/mastra/public/output/docs` into LibSQL vector store

## Commands

```bash
npm install          # Install dependencies
npm run dev          # Start Mastra Studio at localhost:4111
npm run build        # Build production server
npm start            # Start production server
```

## Project Structure

```
src/mastra/
├── index.ts                          # Mastra config (agents, workflows, scorers, storage, vectors, observability)
├── vector-store.ts                   # Shared LibSQLVector instance + constants (medevio_docs index)
├── agents/medevio-help-agent.ts      # Medevio Help Agent (gemini-2.5-flash, memory, guardrails, evals)
├── tools/
│   ├── clickup-tools.ts              # ClickUp CRUD tools (create, list, update, delete tasks)
│   └── medevio-knowledge-tool.ts     # RAG knowledge search via LibSQL vector store (createVectorQueryTool)
├── processors/
│   └── topical-alignment-processor.ts # LLM-based topic classifier (currently disabled, TODO)
├── scorers/medevio-scorer.ts         # 3 scorers: completeness (prebuilt), topical alignment, Czech language quality
├── workflows/
│   ├── docs-scraper-workflow.ts      # Scrape docs: prepare URLs → foreach with concurrency:2 → aggregate
│   └── embed-docs-workflow.ts        # Embed docs: discover .md files in public/output/docs → chunk → embed → upsert to vector store
└── public/
    └── output/docs/                  # Scraped Medevio help articles (Markdown), source for embedding workflow
scripts/
└── scrape-and-embed.ts                    # Trigger docs scraper with napoveda.medevio.cz URLs
```

## Key Technical Details

- **Node.js** >= 22.13.0 required
- **Module system**: ES2022 (bundler resolution)
- **Storage**: LibSQL (`file:./mastra.db`) — also used for vector store
- **Observability**: Pino logger (info), DefaultExporter + CloudExporter with SensitiveDataFilter
- **Memory**: Basic Memory on Medevio Help Agent

## Environment Variables

```bash
OPENAI_API_KEY=...                    # Required - for scorers (GPT-4o judge), guardrail processors, and RAG embeddings (text-embedding-3-small)
GOOGLE_GENERATIVE_AI_API_KEY=...      # Required - for Medevio Help Agent (Gemini 2.5 Flash) and knowledge search
CLICKUP_API_KEY=...                   # Required - for ClickUp task management tools
CLICKUP_LIST_ID=...                   # Required - target ClickUp list for task operations
MASTRA_CLOUD_ACCESS_TOKEN=...         # Optional - for Mastra Cloud traces
```

## Key Dependencies

- `@mastra/core`, `@mastra/evals`, `@mastra/memory`, `@mastra/libsql`, `@mastra/loggers`, `@mastra/observability`, `@mastra/rag`
- `@ai-sdk/google` - Gemini provider for agent LLM
- `ai` - Vercel AI SDK (embedMany for RAG pipeline)
- `cheerio` + `turndown` - HTML parsing and Markdown conversion (docs scraper)
- `zod` - Schema validation

## Medevio Help Agent Details

The agent (`medevio-help-agent.ts`) uses Gemini 2.5 Flash, responds in Czech, and has two tool categories:
- **Knowledge search** - RAG via `createVectorQueryTool` querying the LibSQL vector store (`medevio_docs` index). Returns relevant documentation chunks that the agent synthesizes into answers.
- **ClickUp CRUD** - Create, list, update, delete tasks via ClickUp API v2.

**Guardrails (input processors):**
1. `TopicalAlignmentProcessor` - LLM-based topic classifier (currently commented out, TODO: handle greetings)
2. `PromptInjectionDetector` - Blocks jailbreak attempts (GPT-4o-mini, threshold 0.8)
3. `ModerationProcessor` - Blocks hate, harassment, violence, self-harm, swearing (GPT-4o-mini, threshold 0.7)

**Evals (scorers, all sampled at 100%):**
1. `medevioCompletenessScorer` - Prebuilt completeness scorer
2. `topicalAlignmentScorer` - Custom LLM-judged (GPT-4o): checks on-topic / off-topic refusal behavior
3. `czechLanguageQualityScorer` - Custom LLM-judged (GPT-4o): grammar 40%, naturalness 30%, terminology 30%

## Docs Scraper Details

The docs scraper workflow (`docs-scraper-workflow.ts`) processes multiple index URLs in parallel (concurrency: 2), extracts article links, scrapes each article with 500ms delays, converts HTML to Markdown via Turndown, and saves to `output/docs/` with frontmatter. The `scripts/scrape-and-embed.ts` script triggers it with URLs from `napoveda.medevio.cz`.

## Embed Docs Workflow Details

The embed docs workflow (`embed-docs-workflow.ts`) reads all `.md` files from `src/mastra/public/output/docs`, chunks them with markdown-aware splitting (`MDocument`), embeds with OpenAI `text-embedding-3-small`, and upserts into the LibSQL vector store (`medevio_docs` index). It performs a full re-index each run (truncates existing index). Run it from Mastra Studio or via API after placing/updating docs in the public directory.

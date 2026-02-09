# CLAUDE.md

## Project Overview

Mastra AI project (TypeScript) with two main capabilities:
1. **Weather agent** - Weather forecasting and activity planning using OpenAI GPT-4o
2. **Docs scraper workflow** - Bulk scraping web documentation to Markdown files

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
├── index.ts                          # Mastra config (agents, workflows, storage, observability)
├── agents/weather-agent.ts           # Weather agent (openai/gpt-4o, memory-enabled)
├── tools/weather-tool.ts             # Weather tool (Open-Meteo API, no API key needed)
├── workflows/
│   ├── weather-workflow.ts           # Fetch weather → plan activities
│   └── docs-scraper-workflow.ts      # Scrape docs: prepare URLs → foreach with concurrency:2 → aggregate
├── scorers/weather-scorer.ts         # 3 scorers: tool-call appropriateness, completeness, translation quality
└── public/                           # Static files copied to .build/output at build time
```

## Key Technical Details

- **Node.js** >= 22.13.0 required
- **Module system**: ES2022 (bundler resolution)
- **Storage**: LibSQL (`file:./mastra.db`)
- **Observability**: Pino logger (info), DefaultExporter + CloudExporter with SensitiveDataFilter
- **Memory**: Basic Memory on weather agent

## Environment Variables

```bash
OPENAI_API_KEY=...                    # Required - for weather agent and translation scorer
MASTRA_CLOUD_ACCESS_TOKEN=...         # Optional - for Mastra Cloud traces
```

## Key Dependencies

- `@mastra/core`, `@mastra/evals`, `@mastra/memory`, `@mastra/libsql`, `@mastra/loggers`, `@mastra/observability`
- `cheerio` + `turndown` - HTML parsing and Markdown conversion (docs scraper)
- `zod` - Schema validation

## Docs Scraper Details

The docs scraper workflow (`docs-scraper-workflow.ts`) processes multiple index URLs in parallel (concurrency: 2), extracts article links, scrapes each article with 500ms delays, converts HTML to Markdown via Turndown, and saves to `output/docs/` with frontmatter. The `scripts/run-scraper.ts` script triggers it with URLs from `napoveda.medevio.cz`.

## Weather Agent Details

The weather agent uses `weatherTool` (Open-Meteo geocoding + forecast API), supports non-English locations via translation, and is evaluated by 3 scorers: tool call appropriateness, completeness, and translation quality (custom LLM-judged scorer using GPT-4o).

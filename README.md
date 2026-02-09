# Medevio AI Assistant

> **Medevio job interview assignment** - Building an AI-powered internal assistant for the Medevio team using the [Mastra](https://mastra.ai/) framework.

## What is this?

**Mad Evio** is a Czech-language AI assistant for Medevio employees. It answers questions about the Medevio app (patient-doctor communication platform) using a knowledge base and manages tasks in ClickUp.

### Features

- **Knowledge search** - Searches Medevio help documentation via Gemini File Search API
- **ClickUp integration** - Create, list, update, and delete tasks
- **Guardrails** - Prompt injection detection, content moderation, topical alignment
- **Docs scraper** - Workflow to bulk-scrape Medevio help pages into Markdown files (WIP)

## Work in Progress

> **Note:** This project will likely not work out of the box. The knowledge search tool relies on a Gemini File Search store (`GEMINI_FILE_SEARCH_API_STORE_ID`) that is tied to a specific Google Cloud project and cannot be accessed externally.
>
> A planned workflow will automate the creation of a new Gemini File Search store from the scraped documentation, making the project fully self-contained.

## Setup

### Prerequisites

- Node.js >= 22.13.0

### Installation

```bash
npm install
```

### Environment variables

Copy the example env file and fill in your keys:

```bash
cp .env.example .env
```

Then edit `.env` with your values:

| Variable | Required | Description |
|---|---|---|
| `GOOGLE_GENERATIVE_AI_API_KEY` | Yes | Gemini API key (agent + knowledge search) |
| `OPENAI_API_KEY` | Yes | OpenAI key (scorers and guardrail processors) |
| `CLICKUP_API_KEY` | Yes | ClickUp API key for task management |
| `CLICKUP_LIST_ID` | Yes | Target ClickUp list ID |
| `GEMINI_FILE_SEARCH_API_STORE_ID` | Yes | Gemini File Search store ID (see [Work in Progress](#work-in-progress)) |
| `MASTRA_CLOUD_ACCESS_TOKEN` | No | Mastra Cloud traces |

### Running

```bash
npm run dev          # Start Mastra Studio at localhost:4111
npm run build        # Build production server
npm start            # Start production server
```

Open [http://localhost:4111](http://localhost:4111) to access [Mastra Studio](https://mastra.ai/docs/getting-started/studio) - an interactive UI for testing agents, workflows, and evals.

## Project Structure

```
src/mastra/
├── index.ts                           # Mastra config (agents, workflows, scorers, storage, observability)
├── agents/medevio-help-agent.ts       # Medevio Help Agent (Gemini 2.5 Flash, memory, guardrails, evals)
├── tools/
│   ├── clickup-tools.ts               # ClickUp CRUD tools
│   └── medevio-knowledge-tool.ts      # Knowledge search via internal Gemini agent with fileSearch
├── processors/
│   └── topical-alignment-processor.ts # LLM-based topic classifier (WIP)
├── scorers/medevio-scorer.ts          # Completeness, topical alignment, Czech language quality
├── workflows/
│   └── docs-scraper-workflow.ts       # Bulk scrape help docs to Markdown
└── public/                            # Static files
scripts/
└── run-scraper.ts                     # Trigger docs scraper with napoveda.medevio.cz URLs
```

## Tech Stack

- [Mastra](https://mastra.ai/) - AI agent framework
- [Gemini 2.5 Flash](https://ai.google.dev/) - Main agent model + knowledge search
- [GPT-4o / GPT-4o-mini](https://openai.com/) - Eval judges + guardrail processors
- [ClickUp API v2](https://clickup.com/api/) - Task management
- [cheerio](https://cheerio.js.org/) + [Turndown](https://github.com/mixmark-io/turndown) - HTML scraping and Markdown conversion

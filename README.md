# Mad Evio AI Assistant

> **Medevio job interview assignment** - Building an AI-powered internal assistant for the Medevio team using the [Mastra](https://mastra.ai/) framework.

## What is this?

**Mad Evio** is a Czech-language AI assistant for Medevio employees. It answers questions about the Medevio app (patient-doctor communication platform) using a RAG knowledge base and manages tasks in ClickUp.

### Features

- **Knowledge search** - RAG pipeline that searches Medevio help documentation via a local LibSQL vector store
- **ClickUp integration** - Create, list, update, and delete tasks
- **Guardrails** - Prompt injection detection, content moderation, topical alignment
- **Docs scraper** - Workflow to bulk-scrape Medevio help pages into Markdown and embed them into the vector store
- **Embed docs** - Standalone workflow to re-embed existing Markdown docs without re-scraping

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
| `OPENAI_API_KEY` | Yes | OpenAI key (RAG embeddings, scorers, guardrail processors) |
| `CLICKUP_API_KEY` | Yes | ClickUp API key — provided by the author |
| `CLICKUP_LIST_ID` | Yes | Target ClickUp list ID — provided by the author |

> `CLICKUP_API_KEY` and `CLICKUP_LIST_ID` are tied to the author's ClickUp workspace. Ask the author for these values.

### Running

```bash
npm run dev          # Start Mastra Studio at localhost:4111
```

Open [http://localhost:4111](http://localhost:4111) to access [Mastra Studio](https://mastra.ai/docs/getting-started/studio).

### Building the knowledge base

Before chatting with the agent, you need to populate the vector store with Medevio help documentation.

Run the scrape and embed script from your terminal:

```bash
npx tsx --env-file=.env scripts/scrape-and-embed.ts
```

This will scrape all help articles from `napoveda.medevio.cz`, chunk them, and embed them into the local vector store. Once complete, the **Medevio Help Agent** can answer questions about the Medevio app.

> You can also run the workflows from Mastra Studio: **docs-scraper-workflow** (scrape + embed) or **embed-docs-workflow** (re-embed existing Markdown files without re-scraping).

### Production

```bash
npm run build        # Build production server
npm start            # Start production server
```

## Tech Stack

- [Mastra](https://mastra.ai/) - AI agent framework
- [Gemini 2.5 Flash](https://ai.google.dev/) - Main agent model
- [GPT-4o / GPT-4o-mini](https://openai.com/) - Eval judges + guardrail processors
- [OpenAI text-embedding-3-small](https://openai.com/) - RAG embeddings
- [LibSQL](https://turso.tech/libsql) - Vector store + application storage
- [ClickUp API v2](https://clickup.com/api/) - Task management
- [cheerio](https://cheerio.js.org/) + [Turndown](https://github.com/mixmark-io/turndown) - HTML scraping and Markdown conversion

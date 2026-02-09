import { Agent } from '@mastra/core/agent';
import { google } from '@ai-sdk/google';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

// Internal Gemini agent with only fileSearch provider tool.
// Kept separate from the main agent to avoid provider-defined tool conflicts
// with regular Mastra tools (ClickUp CRUD).
const knowledgeAgent = new Agent({
  id: 'medevio-knowledge-search',
  name: 'Medevio Knowledge Search',
  instructions:
    'Prohledej nápovědu Medevio a vrať relevantní informace. Vždy odpovídej v češtině. ' +
    'Pokud informaci nenajdeš, řekni to přímo.',
  model: 'google/gemini-2.5-flash',
  tools: {
    fileSearch: google.tools.fileSearch({
      fileSearchStoreNames: ['fileSearchStores/medevio-help-91bp9hd1r7d0'],
    }),
  },
});

export const medevioKnowledgeTool = createTool({
  id: 'medevio-knowledge-search',
  description:
    'Search the Medevio help documentation for answers about the Medevio app. ' +
    'Use this tool whenever the user asks how to do something in Medevio.',
  inputSchema: z.object({
    query: z
      .string()
      .describe('The question to search for in Medevio documentation (in Czech)'),
  }),
  outputSchema: z.object({
    answer: z.string(),
  }),
  execute: async (inputData) => {
    const result = await knowledgeAgent.generate(inputData.query);
    return { answer: result.text };
  },
});

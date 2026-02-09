import { createVectorQueryTool } from '@mastra/rag';
import { ModelRouterEmbeddingModel } from '@mastra/core/llm';
import { MEDEVIO_DOCS_INDEX } from '../vector-store';

export const medevioKnowledgeTool = createVectorQueryTool({
  id: 'medevio-knowledge-search',
  description:
    'Search the Medevio help documentation for answers about the Medevio app. ' +
    'Use this tool whenever the user asks how to do something in Medevio. ' +
    'Returns relevant documentation chunks that you should synthesize into a clear answer. ' +
    'If the tool returns an error about the knowledge base not being initialized, ' +
    'tell the user that the knowledge base needs to be built first by running the embed-docs workflow.',
  vectorStoreName: 'libsqlVector',
  indexName: MEDEVIO_DOCS_INDEX,
  model: new ModelRouterEmbeddingModel('openai/text-embedding-3-small'),
});

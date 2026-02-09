import { LibSQLVector } from '@mastra/libsql';

export const MEDEVIO_DOCS_INDEX = 'medevio_docs';
export const EMBEDDING_DIMENSION = 1536; // text-embedding-3-small

export const libsqlVector = new LibSQLVector({
  id: 'libsql-vector',
  url: 'file:./mastra.db',
});

// Ensure the vector index exists at startup so the knowledge tool
// doesn't crash if the embed workflow hasn't been run yet.
// An empty index returns no results, which the agent handles gracefully.
libsqlVector.createIndex({
  indexName: MEDEVIO_DOCS_INDEX,
  dimension: EMBEDDING_DIMENSION,
  metric: 'cosine',
}).catch(() => {
  // Index already exists — ignore
});

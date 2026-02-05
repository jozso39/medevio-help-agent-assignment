import { mastra } from '../src/mastra/index.js';

async function main() {
  const workflow = mastra.getWorkflow('docsScraperWorkflow');
  const run = await workflow.createRun();

  console.log('Starting docs scraper workflow...');

  const result = await run.start({
    inputData: {
      indexUrl: 'https://napoveda.medevio.cz/support/solutions/folders/204000127921',
      baseUrl: 'https://napoveda.medevio.cz',
    },
  });

  console.log('\nWorkflow completed:');
  console.log(JSON.stringify(result, null, 2));
}

main().catch(console.error);

import { mastra } from '../src/mastra/index.js';

async function main() {
  const workflow = mastra.getWorkflow('docsScraperWorkflow');
  const run = await workflow.createRun();

  console.log('Starting scrape and embed workflow...');

  const result = await run.start({ inputData: {} });

  console.log('\nWorkflow completed:');
  console.log(JSON.stringify(result, null, 2));
}

main().catch(console.error);

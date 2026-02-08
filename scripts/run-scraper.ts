import { mastra } from '../src/mastra/index.js';

async function main() {
  const workflow = mastra.getWorkflow('docsScraperWorkflow');
  const run = await workflow.createRun();

  console.log('Starting docs scraper workflow...');

  const result = await run.start({
    inputData: {
      indexUrls: [
        "https://napoveda.medevio.cz/support/solutions/folders/204000127935",
        "https://napoveda.medevio.cz/support/solutions/folders/204000127921",
        "https://napoveda.medevio.cz/support/solutions/folders/204000127922",
        "https://napoveda.medevio.cz/support/solutions/folders/204000127938",
        "https://napoveda.medevio.cz/support/solutions/folders/204000127986",
        "https://napoveda.medevio.cz/support/solutions/folders/204000127926",
        "https://napoveda.medevio.cz/support/solutions/folders/204000127928",
        "https://napoveda.medevio.cz/support/solutions/folders/204000127923",
        "https://napoveda.medevio.cz/support/solutions/folders/204000127924",
        "https://napoveda.medevio.cz/support/solutions/folders/204000127939",
        "https://napoveda.medevio.cz/support/solutions/folders/204000127925",
        "https://napoveda.medevio.cz/support/solutions/folders/204000127927",
        "https://napoveda.medevio.cz/support/solutions/folders/204000127929",
        "https://napoveda.medevio.cz/support/solutions/folders/204000127930"
      ],
    },
  });

  console.log('\nWorkflow completed:');
  console.log(JSON.stringify(result, null, 2));
}

main().catch(console.error);

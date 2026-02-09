import { z } from 'zod';
import { createCompletenessScorer } from '@mastra/evals/scorers/prebuilt';
import {
  getAssistantMessageFromRunOutput,
  getUserMessageFromRunInput,
} from '@mastra/evals/scorers/utils';
import { createScorer } from '@mastra/core/evals';

// Prebuilt: evaluates whether the response addresses all parts of the user's question
export const medevioCompletenessScorer = createCompletenessScorer();

// Custom: evaluates whether the agent stays on Medevio-related topics
export const topicalAlignmentScorer = createScorer({
  id: 'topical-alignment-scorer',
  name: 'Topical Alignment',
  description:
    'Evaluates whether the agent stays on topic (Medevio app, task management) and refuses off-topic questions',
  type: 'agent',
  judge: {
    model: 'openai/gpt-4o',
    instructions:
      'You are an expert evaluator of topical alignment for a customer support agent. ' +
      'The agent should ONLY discuss topics related to the Medevio application (patient-doctor communication app), ' +
      'its features, and ClickUp task management. The agent should politely refuse off-topic questions. ' +
      'Return only the structured JSON matching the provided schema.',
  },
})
  .preprocess(({ run }) => {
    const userText = getUserMessageFromRunInput(run.input) || '';
    const assistantText = getAssistantMessageFromRunOutput(run.output) || '';
    return { userText, assistantText };
  })
  .analyze({
    description:
      'Determine if the user question is on-topic and if the agent responded appropriately',
    outputSchema: z.object({
      isUserQuestionOnTopic: z
        .boolean()
        .describe('Whether the user question is about Medevio or task management'),
      isResponseOnTopic: z
        .boolean()
        .describe('Whether the agent response stays on topic'),
      didRefuseOffTopic: z
        .boolean()
        .describe('If off-topic question, whether the agent politely refused'),
      explanation: z.string().default(''),
    }),
    createPrompt: ({ results }) => `
      You are evaluating a Medevio help agent for topical alignment.
      The agent should ONLY answer questions about:
      - The Medevio application (patient-doctor communication)
      - App features, settings, navigation, troubleshooting
      - ClickUp task management (creating, editing, listing, deleting tasks)

      User message:
      """
      ${results.preprocessStepResult.userText}
      """

      Agent response:
      """
      ${results.preprocessStepResult.assistantText}
      """

      Evaluate:
      1) Is the user's question related to Medevio or task management?
      2) Does the agent's response stay on topic?
      3) If the question was off-topic, did the agent politely refuse?

      Return JSON:
      {
        "isUserQuestionOnTopic": boolean,
        "isResponseOnTopic": boolean,
        "didRefuseOffTopic": boolean,
        "explanation": string
      }
    `,
  })
  .generateScore(({ results }) => {
    const r = (results as any)?.analyzeStepResult || {};
    // On-topic question + on-topic response = 1.0
    if (r.isUserQuestionOnTopic && r.isResponseOnTopic) return 1;
    // Off-topic question + agent refused = 1.0 (correct behavior)
    if (!r.isUserQuestionOnTopic && r.didRefuseOffTopic) return 1;
    // Off-topic question + agent didn't refuse = 0.0 (should have refused)
    if (!r.isUserQuestionOnTopic && !r.didRefuseOffTopic) return 0;
    // On-topic question but off-topic response = 0.3
    if (r.isUserQuestionOnTopic && !r.isResponseOnTopic) return 0.3;
    return 0.5;
  })
  .generateReason(({ results, score }) => {
    const r = (results as any)?.analyzeStepResult || {};
    return `Topical alignment: userOnTopic=${r.isUserQuestionOnTopic ?? false}, responseOnTopic=${r.isResponseOnTopic ?? false}, refusedOffTopic=${r.didRefuseOffTopic ?? false}. Score=${score}. ${r.explanation ?? ''}`;
  });

// Custom: evaluates Czech language quality in responses
export const czechLanguageQualityScorer = createScorer({
  id: 'czech-language-quality-scorer',
  name: 'Czech Language Quality',
  description:
    'Evaluates whether the agent responds in proper Czech with correct grammar and appropriate medical/app terminology',
  type: 'agent',
  judge: {
    model: 'openai/gpt-4o',
    instructions:
      'You are an expert evaluator of Czech language quality. ' +
      'Evaluate grammar, naturalness, and correctness of medical and application terminology in Czech text. ' +
      'Return only the structured JSON matching the provided schema.',
  },
})
  .preprocess(({ run }) => {
    const assistantText = getAssistantMessageFromRunOutput(run.output) || '';
    return { assistantText };
  })
  .analyze({
    description: 'Evaluate Czech language quality of the response',
    outputSchema: z.object({
      isInCzech: z.boolean().describe('Whether the response is in Czech'),
      grammarScore: z
        .number()
        .min(0)
        .max(1)
        .describe('Grammar correctness (0-1)'),
      naturalness: z
        .number()
        .min(0)
        .max(1)
        .describe('How natural the Czech sounds (0-1)'),
      terminologyCorrectness: z
        .number()
        .min(0)
        .max(1)
        .describe('Correctness of medical/app terminology (0-1)'),
      explanation: z.string().default(''),
    }),
    createPrompt: ({ results }) => `
      You are evaluating the Czech language quality of a Medevio help agent's response.

      Agent response:
      """
      ${results.preprocessStepResult.assistantText}
      """

      Evaluate:
      1) Is the response in Czech?
      2) Rate grammar correctness (0-1): spelling, declension, conjugation, word order
      3) Rate naturalness (0-1): does it sound like a native Czech speaker?
      4) Rate terminology correctness (0-1): are medical and app terms used correctly?

      Return JSON:
      {
        "isInCzech": boolean,
        "grammarScore": number,
        "naturalness": number,
        "terminologyCorrectness": number,
        "explanation": string
      }
    `,
  })
  .generateScore(({ results }) => {
    const r = (results as any)?.analyzeStepResult || {};
    if (!r.isInCzech) return 0;
    // Weighted average: grammar 40%, naturalness 30%, terminology 30%
    return (
      0.4 * (r.grammarScore ?? 0) +
      0.3 * (r.naturalness ?? 0) +
      0.3 * (r.terminologyCorrectness ?? 0)
    );
  })
  .generateReason(({ results, score }) => {
    const r = (results as any)?.analyzeStepResult || {};
    return `Czech quality: inCzech=${r.isInCzech ?? false}, grammar=${r.grammarScore ?? 0}, naturalness=${r.naturalness ?? 0}, terminology=${r.terminologyCorrectness ?? 0}. Score=${score}. ${r.explanation ?? ''}`;
  });

export const medevioScorers = {
  medevioCompletenessScorer,
  topicalAlignmentScorer,
  czechLanguageQualityScorer,
};

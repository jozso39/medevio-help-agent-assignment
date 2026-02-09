import { Agent } from '@mastra/core/agent';
import { z } from 'zod';
import type { Processor, ProcessInputArgs } from '@mastra/core/processors';

const TOPICAL_ALIGNMENT_INSTRUCTIONS = `Jsi systém pro analýzu obsahu, který určuje, zda se text drží tématu.

Povolená témata:
1. Cokoliv související s produktem Medevio — aplikací pro komunikaci mezi lékaři a pacienty. To zahrnuje: objednávání, léčebné plány, zprávy, recepty, e-neschopenky, notifikace, nastavení ordinace, import pacientů, fakturace, a jakékoliv další funkce či procesy v Medeviu. Dotaz nemusí výslovně zmiňovat "Medevio" — pokud se týká zdravotnictví, komunikace lékař-pacient nebo funkcí typických pro takovou aplikaci, je on-topic.
2. Správa úkolů v ClickUpu (vytváření, úprava, mazání, dotazy na úkoly).
3. Konverzační a meta-dotazy směřované na asistenta — pozdravy, představování se, otázky na schopnosti asistenta (např. "co pro mě můžeš udělat?", "jak mi můžeš pomoct?", "co umíš?"), poděkování a rozloučení.

Vše v českém jazyce.

Urči, zda text zůstává v rámci definovaného rozsahu činnosti. Označ jakýkoli obsah, který se odchyluje od povolených témat.`;

const analysisSchema = z.object({
  isOnTopic: z
    .boolean()
    .describe('Whether the text is on topic (Medevio usage or ClickUp task management)'),
  reason: z
    .string()
    .describe('Brief explanation of the classification decision'),
});

export class TopicalAlignmentProcessor implements Processor {
  readonly id = 'topical-alignment' as const;
  private classifierAgent: Agent;

  constructor(model: string = 'openai/gpt-4o-mini') {
    this.classifierAgent = new Agent({
      id: 'topical-alignment-classifier',
      name: 'Topical Alignment Classifier',
      instructions: TOPICAL_ALIGNMENT_INSTRUCTIONS,
      model,
    });
  }

  async processInput({ messages, abort }: ProcessInputArgs) {
    const lastUserMessage = [...messages]
      .reverse()
      .find((m) => m.role === 'user');
    if (!lastUserMessage) return messages;

    const textContent = this.extractText(lastUserMessage);
    if (!textContent.trim()) return messages;

    // Allow very short messages (greetings) through without LLM check
    const wordCount = textContent.trim().split(/\s+/).length;
    if (wordCount <= 2) return messages;

    const result = await this.classifierAgent.generate(
      `Analyzuj následující text a urči, zda se drží tématu:\n\n"${textContent}"`,
      { structuredOutput: { schema: analysisSchema } },
    );

    if (!result.object?.isOnTopic) {
      abort(
        'Omlouvám se, ale mohu odpovídat pouze na otázky týkající se aplikace Medevio a správy úkolů v ClickUp. ' +
          'Pokud máte dotaz ohledně Medevio, rád vám pomohu.',
      );
    }

    return messages;
  }

  private extractText(message: { content: unknown }): string {
    if (typeof message.content === 'string') return message.content;
    if (
      message.content &&
      typeof message.content === 'object' &&
      'parts' in message.content
    ) {
      const parts = (message.content as { parts?: { type: string; text?: string }[] })
        .parts;
      if (Array.isArray(parts)) {
        return parts
          .filter((p) => p.type === 'text' && p.text)
          .map((p) => p.text!)
          .join(' ');
      }
    }
    return '';
  }
}

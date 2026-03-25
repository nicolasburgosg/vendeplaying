import { Injectable } from '@nestjs/common';
import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';

@Injectable()
export class AiService {
  async summarizeConversation(params: {
    sellerName: string;
    tone: string | null;
    messages: Array<{
      direction: string;
      sender_type: string;
      body: string | null;
      created_at: string;
    }>;
  }) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('Falta OPENAI_API_KEY para generar resúmenes.');
    }

    const transcript = params.messages
      .map((message) => {
        const actor =
          message.direction === 'inbound'
            ? 'Cliente'
            : message.sender_type === 'human'
              ? 'Agente humano'
              : 'VendeTo';

        return `[${message.created_at}] ${actor}: ${message.body ?? '[sin contenido]'}`;
      })
      .join('\n');

    const result = await generateText({
      model: openai(process.env.VENDETO_AI_MODEL ?? 'gpt-4.1-mini'),
      system: [
        `Resume conversaciones comerciales de ${params.sellerName}.`,
        'Responde siempre en español.',
        'Devuelve un resumen operativo corto con intención, objeciones, estado comercial y próximo paso.',
        params.tone ? `Mantén el tono ${params.tone}.` : null,
      ]
        .filter(Boolean)
        .join('\n'),
      prompt: transcript,
    });

    return result.text.trim();
  }
}

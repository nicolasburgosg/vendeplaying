import { Injectable } from '@nestjs/common';
import { openai } from '@ai-sdk/openai';
import { generateObject, generateText, stepCountIs, tool } from 'ai';
import { z } from 'zod';

const SELLER_REPLY_PROMPT_VERSION = 'vendeto-auto-reply-2026-03-25';

const sellerDecisionSchema = z.object({
  intent: z.enum([
    'product_discovery',
    'faq',
    'payment_ready',
    'order_follow_up',
    'handoff_required',
    'general_support',
  ]),
  confidence: z.number().min(0).max(1),
  shouldHandoff: z.boolean(),
  shouldOfferPayment: z.boolean(),
  productQuery: z.string().nullable(),
  knowledgeQuery: z.string().nullable(),
  nextStep: z.string(),
  caution: z.string().nullable(),
});

type ConversationMessage = {
  direction: string;
  sender_type: string;
  body: string | null;
  created_at: string;
  message_type?: string | null;
};

type SellerProfile = {
  sellerName: string;
  tone: string | null;
  salesStyle: string;
  messageLength: string;
  welcomeMessage: string | null;
  humanHandoffMessage: string | null;
  companyDescription: string | null;
  targetAudience: string | null;
  specialInstructions: string | null;
  forbiddenWords: string[];
  useEmojis: boolean;
};

type ProductContext = {
  name: string;
  description: string | null;
  price: string;
  currencyCode: string;
  stockQuantity: number;
  status: string;
};

type KnowledgeItemContext = {
  title: string | null;
  question: string | null;
  answer: string;
  category: string;
};

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

  async generateSellerReply(params: {
    seller: SellerProfile;
    customerName: string | null;
    latestInboundMessage: {
      body: string | null;
      messageType: string;
    };
    messages: ConversationMessage[];
    products: ProductContext[];
    knowledgeItems: KnowledgeItemContext[];
  }) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('Falta OPENAI_API_KEY para generar respuestas automáticas.');
    }

    const model = openai(process.env.VENDETO_AI_MODEL ?? 'gpt-4.1-mini');
    const customerLabel = params.customerName?.trim() || 'Cliente';
    const latestCustomerMessage =
      params.latestInboundMessage.body?.trim() ||
      `El cliente envió un mensaje tipo ${params.latestInboundMessage.messageType} sin texto adicional.`;
    const transcript = params.messages
      .map((message) => {
        const actor =
          message.direction === 'inbound'
            ? customerLabel
            : message.sender_type === 'human'
              ? 'Agente humano'
              : message.sender_type === 'ai'
                ? params.seller.sellerName
                : 'VendeTo';

        const content =
          message.body?.trim() ||
          `[sin texto${message.message_type ? ` · ${message.message_type}` : ''}]`;

        return `[${message.created_at}] ${actor}: ${content}`;
      })
      .join('\n');

    const decisionResult = await generateObject({
      model,
      schema: sellerDecisionSchema,
      system: [
        `Eres el motor de decisión comercial de ${params.seller.sellerName}.`,
        'Responde siempre en español.',
        'No inventes precios, stock, políticas, tiempos ni enlaces de pago.',
        'Marca handoff cuando falte contexto crítico, el cliente pida negociación especial, exista reclamo delicado o se necesite intervención humana.',
        'Marca shouldOfferPayment solo si el cliente ya está listo para comprar.',
      ].join('\n'),
      prompt: [
        `Prompt version: ${SELLER_REPLY_PROMPT_VERSION}.`,
        `Cliente: ${customerLabel}.`,
        `Último mensaje: ${latestCustomerMessage}`,
        transcript ? `Historial reciente:\n${transcript}` : null,
        `Perfil del negocio: ${params.seller.companyDescription ?? 'Sin descripción'}.`,
        `Público objetivo: ${params.seller.targetAudience ?? 'Sin público definido'}.`,
      ]
        .filter(Boolean)
        .join('\n\n'),
    });

    const decision = decisionResult.object;
    const handoffReply = params.seller.humanHandoffMessage?.trim();

    if (decision.shouldHandoff && handoffReply) {
      return {
        promptVersion: SELLER_REPLY_PROMPT_VERSION,
        decision,
        reply: handoffReply,
      };
    }

    const result = await generateText({
      model,
      system: [
        `Eres ${params.seller.sellerName}, la IA vendedora de VendeTo.`,
        'Responde siempre en español claro, útil y comercial.',
        'Tu objetivo es mover la conversación al siguiente paso de venta sin sonar robótico.',
        'No inventes productos, precios, disponibilidad, políticas ni enlaces de pago.',
        `Tono preferido: ${params.seller.tone ?? 'cercano y confiable'}.`,
        `Estilo de venta: ${params.seller.salesStyle}.`,
        `Longitud esperada: ${params.seller.messageLength}.`,
        params.seller.companyDescription
          ? `Negocio: ${params.seller.companyDescription}.`
          : null,
        params.seller.targetAudience
          ? `Público objetivo: ${params.seller.targetAudience}.`
          : null,
        params.seller.specialInstructions
          ? `Instrucciones especiales: ${params.seller.specialInstructions}.`
          : null,
        params.seller.forbiddenWords.length > 0
          ? `Nunca uses estas palabras: ${params.seller.forbiddenWords.join(', ')}.`
          : null,
        params.seller.useEmojis
          ? 'Puedes usar pocos emojis si de verdad ayudan.'
          : 'No uses emojis.',
        params.seller.welcomeMessage
          ? `Mensaje de bienvenida preferido: ${params.seller.welcomeMessage}.`
          : null,
        handoffReply
          ? `Si necesitas pasar a humano, puedes inspirarte en este mensaje: ${handoffReply}.`
          : null,
        `Clasificación previa: ${decision.intent}.`,
        `Confianza: ${decision.confidence}.`,
        `¿Debe pasar a humano?: ${decision.shouldHandoff ? 'sí' : 'no'}.`,
        `¿Debe sugerir cobro?: ${decision.shouldOfferPayment ? 'sí' : 'no'}.`,
        `Próximo paso recomendado: ${decision.nextStep}.`,
        decision.caution ? `Precaución operativa: ${decision.caution}.` : null,
      ]
        .filter(Boolean)
        .join('\n'),
      tools: {
        buscarProductos: tool({
          description:
            'Busca productos relevantes en el catálogo activo del negocio.',
          inputSchema: z.object({
            query: z.string().min(1),
          }),
          execute: async ({ query }) => {
            const normalized = query.toLowerCase();

            return params.products
              .filter((product) => {
                const haystack = [
                  product.name,
                  product.description ?? '',
                  product.status,
                ]
                  .join(' ')
                  .toLowerCase();

                return haystack.includes(normalized);
              })
              .slice(0, 5)
              .map((product) => ({
                nombre: product.name,
                descripcion: product.description,
                precio: product.price,
                moneda: product.currencyCode,
                inventario: product.stockQuantity,
              }));
          },
        }),
        buscarBaseComercial: tool({
          description:
            'Busca respuestas en FAQs, políticas, campañas y notas comerciales.',
          inputSchema: z.object({
            query: z.string().min(1),
          }),
          execute: async ({ query }) => {
            const normalized = query.toLowerCase();

            return params.knowledgeItems
              .filter((item) => {
                const haystack = [
                  item.title ?? '',
                  item.question ?? '',
                  item.answer,
                  item.category,
                ]
                  .join(' ')
                  .toLowerCase();

                return haystack.includes(normalized);
              })
              .slice(0, 6)
              .map((item) => ({
                titulo: item.title ?? item.question ?? item.category,
                respuesta: item.answer,
                categoria: item.category,
              }));
          },
        }),
      },
      stopWhen: stepCountIs(4),
      prompt: [
        `Cliente: ${customerLabel}.`,
        `Último mensaje del cliente: ${latestCustomerMessage}`,
        transcript ? `Historial reciente:\n${transcript}` : null,
        decision.productQuery
          ? `Si necesitas catálogo, busca: ${decision.productQuery}`
          : null,
        decision.knowledgeQuery
          ? `Si necesitas base comercial, busca: ${decision.knowledgeQuery}`
          : null,
        decision.shouldOfferPayment
          ? 'Si el cliente está listo para comprar, prepara el terreno para compartir el siguiente paso comercial sin inventar enlaces.'
          : null,
        decision.shouldHandoff
          ? 'La respuesta debe reconocer el límite y preparar takeover humano si aplica.'
          : null,
      ]
        .filter(Boolean)
        .join('\n\n'),
    });

    return {
      promptVersion: SELLER_REPLY_PROMPT_VERSION,
      decision,
      reply: result.text.trim(),
    };
  }
}

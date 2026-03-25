import { Injectable } from '@nestjs/common';
import { openai } from '@ai-sdk/openai';
import { generateObject, generateText } from 'ai';
import { z } from 'zod';

const SELLER_REPLY_PROMPT_VERSION = 'vendeto-auto-reply-fastlane-2026-03-25';
const SELLER_GREETING_FAST_PATH_VERSION =
  'vendeto-greeting-fast-path-2026-03-25';
const SELLER_AI_MODEL = 'gpt-5-mini';
const GREETING_FAST_PATH_MATCHES = new Set([
  'hola',
  'holi',
  'hi',
  'hello',
  'hey',
  'buenas',
  'buenos dias',
  'buenas tardes',
  'buenas noches',
]);
const WAVING_HAND_ONLY_REGEX = /^[\p{White_Space}\p{P}\u{1F44B}\u{FE0F}]+$/u;

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

const sellerReplySchema = sellerDecisionSchema.extend({
  reply: z.string().min(1),
});

export type SellerDecision = z.infer<typeof sellerDecisionSchema>;

type ConversationMessage = {
  direction: string;
  sender_type: string;
  body: string | null;
  created_at: string;
  message_type?: string | null;
};

export type SellerProfile = {
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

export type ProductContext = {
  name: string;
  description: string | null;
  price: string;
  currencyCode: string;
  stockQuantity: number;
  status: string;
};

export type KnowledgeItemContext = {
  title: string | null;
  question: string | null;
  answer: string;
  category: string;
};

export type SellerReplyPlan = {
  route: 'greeting_fast_path' | 'llm_full';
  promptVersion: string;
  decision: SellerDecision;
  reply: string;
};

function normalizeSearchText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function tokenizeSearchText(value: string) {
  return normalizeSearchText(value)
    .split(/[^a-z0-9]+/i)
    .filter((token) => token.length >= 3);
}

function scoreSearchMatch(haystack: string, tokens: string[]) {
  if (tokens.length === 0) {
    return 0;
  }

  const normalizedHaystack = normalizeSearchText(haystack);

  return tokens.reduce((score, token) => {
    if (!normalizedHaystack.includes(token)) {
      return score;
    }

    return score + (normalizedHaystack.startsWith(token) ? 4 : 2);
  }, 0);
}

function normalizeReplyText(value: string) {
  return value.trim();
}

function containsForbiddenWord(candidate: string, forbiddenWords: string[]) {
  const normalizedCandidate = normalizeSearchText(candidate);

  return forbiddenWords.some((word) => {
    const normalizedWord = normalizeSearchText(word.trim());
    return normalizedWord.length > 0 && normalizedCandidate.includes(normalizedWord);
  });
}

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
      model: openai(SELLER_AI_MODEL),
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

  shouldLoadCatalogContext(params: {
    body: string | null;
    messageType: string;
  }) {
    if (!['text', 'interactive'].includes(params.messageType)) {
      return false;
    }

    const body = params.body?.trim();

    if (!body) {
      return false;
    }

    return tokenizeSearchText(body).length > 0;
  }

  tryBuildGreetingFastReply(params: {
    seller: SellerProfile;
    latestInboundMessage: {
      body: string | null;
      messageType: string;
    };
  }): SellerReplyPlan | null {
    if (
      !['text', 'interactive'].includes(params.latestInboundMessage.messageType)
    ) {
      return null;
    }

    const rawBody = params.latestInboundMessage.body?.trim();

    if (!rawBody) {
      return null;
    }

    const normalizedBody = normalizeSearchText(rawBody);
    const isGreetingMatch = GREETING_FAST_PATH_MATCHES.has(normalizedBody);
    const isWavingHandOnly = WAVING_HAND_ONLY_REGEX.test(rawBody);

    if (!isGreetingMatch && !isWavingHandOnly) {
      return null;
    }

    const welcomeMessage = params.seller.welcomeMessage?.trim();
    const emoji = params.seller.useEmojis ? ' 👋' : '';
    const sellerName = params.seller.sellerName.trim() || 'VendeTo';
    const candidate = welcomeMessage
      ? welcomeMessage
      : params.seller.messageLength === 'short'
        ? `¡Hola!${emoji} Soy ${sellerName}. ¿Qué buscas hoy?`
        : `¡Hola!${emoji} Soy ${sellerName}. Te ayudo con productos, precios y pedidos. ¿Qué estás buscando hoy?`;
    const reply = normalizeReplyText(candidate);

    if (!reply || containsForbiddenWord(reply, params.seller.forbiddenWords)) {
      return null;
    }

    return {
      route: 'greeting_fast_path',
      promptVersion: SELLER_GREETING_FAST_PATH_VERSION,
      decision: {
        intent: 'product_discovery',
        confidence: 1,
        shouldHandoff: false,
        shouldOfferPayment: false,
        productQuery: null,
        knowledgeQuery: null,
        nextStep: 'Identificar qué producto o necesidad tiene el cliente.',
        caution: null,
      },
      reply,
    };
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
  }): Promise<SellerReplyPlan> {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('Falta OPENAI_API_KEY para generar respuestas automáticas.');
    }

    const customerLabel = params.customerName?.trim() || 'Cliente';
    const latestCustomerMessage =
      params.latestInboundMessage.body?.trim() ||
      `El cliente envió un mensaje tipo ${params.latestInboundMessage.messageType} sin texto adicional.`;
    const latestMessageTokens = tokenizeSearchText(latestCustomerMessage);
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

    const relevantProducts = params.products
      .map((product) => ({
        ...product,
        score: scoreSearchMatch(
          [product.name, product.description ?? '', product.status].join(' '),
          latestMessageTokens,
        ),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, latestMessageTokens.length > 0 ? 5 : 3)
      .map(({ score: _score, ...product }) => product);

    const relevantKnowledgeItems = params.knowledgeItems
      .map((item) => ({
        ...item,
        score: scoreSearchMatch(
          [item.title ?? '', item.question ?? '', item.answer, item.category].join(
            ' ',
          ),
          latestMessageTokens,
        ),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, latestMessageTokens.length > 0 ? 4 : 2)
      .map(({ score: _score, ...item }) => item);

    const productContext =
      relevantProducts.length > 0
        ? relevantProducts
            .map(
              (product) =>
                `- ${product.name}: ${product.price} ${product.currencyCode}. Stock: ${product.stockQuantity}. ${product.description ?? 'Sin descripción.'}`,
            )
            .join('\n')
        : 'Sin productos relevantes cargados.';

    const knowledgeContext =
      relevantKnowledgeItems.length > 0
        ? relevantKnowledgeItems
            .map(
              (item) =>
                `- ${item.title ?? item.question ?? item.category}: ${item.answer}`,
            )
            .join('\n')
        : 'Sin notas comerciales relevantes.';

    const result = await generateObject({
      model: openai(SELLER_AI_MODEL),
      schema: sellerReplySchema,
      system: [
        `Eres ${params.seller.sellerName}, la IA vendedora de VendeTo.`,
        'Responde siempre en español claro, útil y comercial.',
        'Tu objetivo es mover la conversación al siguiente paso de venta sin sonar robótico.',
        'No inventes productos, precios, disponibilidad, políticas, tiempos ni enlaces de pago.',
        'Si falta contexto crítico, el cliente pide un caso especial o detectas un tema delicado, marca shouldHandoff=true.',
        'Marca shouldOfferPayment solo si el cliente ya está listo para comprar.',
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
        params.seller.humanHandoffMessage
          ? `Si necesitas takeover humano, puedes inspirarte en este mensaje: ${params.seller.humanHandoffMessage}.`
          : null,
      ]
        .filter(Boolean)
        .join('\n'),
      prompt: [
        `Prompt version: ${SELLER_REPLY_PROMPT_VERSION}.`,
        `Cliente: ${customerLabel}.`,
        `Último mensaje del cliente: ${latestCustomerMessage}`,
        transcript ? `Historial reciente:\n${transcript}` : null,
        `Catálogo relevante:\n${productContext}`,
        `Base comercial relevante:\n${knowledgeContext}`,
        'Devuelve una respuesta lista para enviar por WhatsApp en el campo reply.',
      ]
        .filter(Boolean)
        .join('\n\n'),
    });

    const decision = {
      intent: result.object.intent,
      confidence: result.object.confidence,
      shouldHandoff: result.object.shouldHandoff,
      shouldOfferPayment: result.object.shouldOfferPayment,
      productQuery: result.object.productQuery,
      knowledgeQuery: result.object.knowledgeQuery,
      nextStep: result.object.nextStep,
      caution: result.object.caution,
    };
    const handoffReply = params.seller.humanHandoffMessage?.trim();

    if (decision.shouldHandoff && handoffReply) {
      return {
        route: 'llm_full',
        promptVersion: SELLER_REPLY_PROMPT_VERSION,
        decision,
        reply: handoffReply,
      };
    }

    return {
      route: 'llm_full',
      promptVersion: SELLER_REPLY_PROMPT_VERSION,
      decision,
      reply: normalizeReplyText(result.object.reply),
    };
  }
}

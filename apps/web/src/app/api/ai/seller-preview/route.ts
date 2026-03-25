import { openai } from "@ai-sdk/openai";
import { generateObject, generateText, stepCountIs, tool } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getActiveMembership } from "@/lib/organization";
import { createClient } from "@/lib/supabase/server";

const sellerPreviewSchema = z.object({
  message: z.string().min(1, "Escribe el mensaje del cliente."),
});

const SELLER_PREVIEW_PROMPT_VERSION = "vendeto-seller-preview-2026-03-16";
const SELLER_AI_MODEL = "gpt-5-mini";

const sellerDecisionSchema = z.object({
  intent: z.enum([
    "product_discovery",
    "faq",
    "payment_ready",
    "order_follow_up",
    "handoff_required",
    "general_support",
  ]),
  confidence: z.number().min(0).max(1),
  shouldHandoff: z.boolean(),
  shouldOfferPayment: z.boolean(),
  productQuery: z.string().nullable(),
  knowledgeQuery: z.string().nullable(),
  nextStep: z.string(),
  caution: z.string().nullable(),
});

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: "Tu sesión expiró. Vuelve a entrar." },
        { status: 401 },
      );
    }

    const membership = await getActiveMembership(supabase, user.id);

    if (!membership) {
      return NextResponse.json(
        { error: "No tienes una organización activa." },
        { status: 403 },
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        {
          error:
            "Falta OPENAI_API_KEY en el entorno. La vista previa de IA no está disponible todavía.",
        },
        { status: 503 },
      );
    }

    const body = sellerPreviewSchema.safeParse(await request.json());

    if (!body.success) {
      return NextResponse.json(
        { error: "Envía un mensaje válido para generar la vista previa." },
        { status: 400 },
      );
    }

    const organizationId = membership.organization_id;

    const [sellerResult, productsResult, knowledgeResult] = await Promise.all([
      supabase
        .from("ai_seller_profiles")
        .select(
          "seller_name, tone, sales_style, message_length, welcome_message, human_handoff_message, company_description, target_audience, special_instructions, forbidden_words, use_emojis",
        )
        .eq("organization_id", organizationId)
        .maybeSingle(),
      supabase
        .from("products")
        .select("id, name, description, price, currency_code, stock_quantity, status")
        .eq("organization_id", organizationId)
        .eq("status", "active")
        .order("updated_at", { ascending: false })
        .limit(30),
      supabase
        .from("knowledge_items")
        .select("id, title, question, answer, category, priority")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .order("priority", { ascending: true })
        .limit(50),
    ]);

    if (sellerResult.error || !sellerResult.data) {
      return NextResponse.json(
        {
          error:
            "Configura primero el perfil de IA vendedora para poder generar respuestas.",
        },
        { status: 400 },
      );
    }

    const seller = sellerResult.data;
    const products = productsResult.data ?? [];
    const knowledgeItems = knowledgeResult.data ?? [];
    const model = openai(SELLER_AI_MODEL);

    const decisionResult = await generateObject({
      model,
      schema: sellerDecisionSchema,
      system: [
        `Eres el motor de decisión comercial de ${seller.seller_name}.`,
        "Responde siempre en español.",
        "No inventes pagos, stock ni políticas cuando falten datos.",
        "Marca handoff cuando el mensaje requiera negociación, precio personalizado, reclamo o contexto insuficiente.",
        "Marca shouldOfferPayment solo si el cliente ya está listo para comprar o pidió el cobro.",
      ].join("\n"),
      prompt: [
        `Prompt version: ${SELLER_PREVIEW_PROMPT_VERSION}.`,
        `Mensaje del cliente: ${body.data.message}`,
        `Perfil del negocio: ${seller.company_description ?? "Sin descripción"}.`,
        `Público objetivo: ${seller.target_audience ?? "Sin público definido"}.`,
      ].join("\n"),
    });

    const decision = decisionResult.object;

    const result = await generateText({
      model,
      system: [
        `Eres ${seller.seller_name}, la IA vendedora de VendeTo.`,
        "Responde siempre en español claro y comercial, con tono útil y directo.",
        `Tono preferido: ${seller.tone ?? "cercano y confiable"}.`,
        `Estilo de venta: ${seller.sales_style}.`,
        `Longitud esperada: ${seller.message_length}.`,
        seller.company_description
          ? `Negocio: ${seller.company_description}.`
          : null,
        seller.target_audience
          ? `Público objetivo: ${seller.target_audience}.`
          : null,
        seller.special_instructions
          ? `Instrucciones especiales: ${seller.special_instructions}.`
          : null,
        seller.forbidden_words.length > 0
          ? `Nunca uses estas palabras: ${seller.forbidden_words.join(", ")}.`
          : null,
        seller.use_emojis ? "Puedes usar pocos emojis si ayudan." : "No uses emojis.",
        "Si no hay suficiente información, sugiere takeover humano en vez de inventar datos.",
        `Clasificación previa: ${decision.intent}.`,
        `Confianza: ${decision.confidence}.`,
        `¿Debe pasar a humano?: ${decision.shouldHandoff ? "sí" : "no"}.`,
        `¿Debe sugerir cobro?: ${decision.shouldOfferPayment ? "sí" : "no"}.`,
        `Próximo paso recomendado: ${decision.nextStep}.`,
        decision.caution ? `Precaución operativa: ${decision.caution}.` : null,
        seller.human_handoff_message
          ? `Mensaje sugerido para handoff: ${seller.human_handoff_message}.`
          : null,
      ]
        .filter(Boolean)
        .join("\n"),
      tools: {
        buscarProductos: tool({
          description:
            "Busca productos relevantes en el catálogo activo del negocio.",
          inputSchema: z.object({
            query: z.string().min(1),
          }),
          execute: async ({ query }) => {
            const normalized = query.toLowerCase();

            return products
              .filter((product) => {
                const haystack = [
                  product.name,
                  product.description ?? "",
                  product.status,
                ]
                  .join(" ")
                  .toLowerCase();

                return haystack.includes(normalized);
              })
              .slice(0, 5)
              .map((product) => ({
                nombre: product.name,
                descripcion: product.description,
                precio: product.price,
                moneda: product.currency_code,
                inventario: product.stock_quantity,
              }));
          },
        }),
        buscarBaseComercial: tool({
          description:
            "Busca respuestas en FAQs, políticas, campañas y notas comerciales.",
          inputSchema: z.object({
            query: z.string().min(1),
          }),
          execute: async ({ query }) => {
            const normalized = query.toLowerCase();

            return knowledgeItems
              .filter((item) => {
                const haystack = [
                  item.title ?? "",
                  item.question ?? "",
                  item.answer,
                  item.category,
                ]
                  .join(" ")
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
        `Mensaje del cliente: ${body.data.message}`,
        decision.productQuery ? `Si necesitas catálogo, busca: ${decision.productQuery}` : null,
        decision.knowledgeQuery ? `Si necesitas base comercial, busca: ${decision.knowledgeQuery}` : null,
        decision.shouldOfferPayment
          ? "Si ya está listo para comprar, prepara el terreno para enviar un enlace de pago cuando esté configurado."
          : null,
        decision.shouldHandoff
          ? "La respuesta debe reconocer el límite y preparar takeover humano si aplica."
          : null,
      ]
        .filter(Boolean)
        .join("\n"),
    });

    return NextResponse.json({
      promptVersion: SELLER_PREVIEW_PROMPT_VERSION,
      decision,
      reply: result.text,
    });
  } catch (error) {
    console.error("seller-preview route failed", error);

    return NextResponse.json(
      {
        error:
          "No pudimos generar la vista previa ahora mismo. Revisa la configuración de IA e inténtalo de nuevo.",
      },
      { status: 500 },
    );
  }
}

"use client";

import { startTransition, useState } from "react";

type AiDecision = {
  intent: string;
  confidence: number;
  shouldHandoff: boolean;
  shouldOfferPayment: boolean;
  nextStep: string;
  caution: string | null;
};

const INTENT_LABELS: Record<string, string> = {
  product_discovery: "Búsqueda de producto",
  faq: "Pregunta frecuente",
  payment_ready: "Listo para cobro",
  order_follow_up: "Seguimiento de pedido",
  handoff_required: "Escalación a humano",
  general_support: "Soporte general",
};

export function AiPreviewPanel() {
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState<{
    reply: string;
    promptVersion?: string;
    decision?: AiDecision;
  } | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    startTransition(async () => {
      setStatus("loading");
      setError("");

      try {
        const response = await fetch("/api/ai/seller-preview", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ message }),
        });

        const payload = (await response.json()) as {
          reply?: string;
          promptVersion?: string;
          decision?: AiDecision;
          error?: string;
        };

        if (!response.ok || !payload.reply) {
          throw new Error(
            payload.error ?? "No pudimos generar la vista previa ahora mismo.",
          );
        }

        setPreview({
          reply: payload.reply,
          promptVersion: payload.promptVersion,
          decision: payload.decision,
        });
        setStatus("idle");
      } catch (submitError) {
        setPreview(null);
        setStatus("error");
        setError(
          submitError instanceof Error
            ? submitError.message
            : "No pudimos generar la vista previa ahora mismo.",
        );
      }
    });
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
      <form onSubmit={handleSubmit} className="space-y-6 border-t border-line pt-6">
        <label className="grid gap-2 text-sm font-medium">
          Mensaje del cliente
          <textarea
            className="site-textarea"
            name="customerMessage"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Hola, ¿tienen café disponible y cómo puedo pagar?"
            required
          />
        </label>

        {error ? (
          <div className="rounded-[1rem] border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">
            {error}
          </div>
        ) : null}

        <button
          type="submit"
          className="site-button"
          disabled={status === "loading" || message.trim().length === 0}
        >
          {status === "loading" ? "Generando respuesta..." : "Probar respuesta de IA"}
        </button>
      </form>

      <div className="border-t border-line pt-6">
        <p className="site-kicker">Vista previa</p>
        {preview ? (
          <div className="mt-4 space-y-5">
            {preview.decision ? (
              <div className="grid gap-3 text-sm text-muted md:grid-cols-2">
                <p>
                  <span className="font-semibold text-foreground">Intención:</span>{" "}
                  {INTENT_LABELS[preview.decision.intent] ?? preview.decision.intent}
                </p>
                <p>
                  <span className="font-semibold text-foreground">Confianza:</span>{" "}
                  {Math.round(preview.decision.confidence * 100)}%
                </p>
                <p>
                  <span className="font-semibold text-foreground">¿Requiere humano?:</span>{" "}
                  {preview.decision.shouldHandoff ? "Sí" : "No"}
                </p>
                <p>
                  <span className="font-semibold text-foreground">¿Listo para cobro?:</span>{" "}
                  {preview.decision.shouldOfferPayment ? "Sí" : "No"}
                </p>
                <p className="md:col-span-2">
                  <span className="font-semibold text-foreground">Próximo paso:</span>{" "}
                  {preview.decision.nextStep}
                </p>
                {preview.decision.caution ? (
                  <p className="md:col-span-2">
                    <span className="font-semibold text-foreground">Precaución:</span>{" "}
                    {preview.decision.caution}
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="whitespace-pre-wrap text-base leading-8 text-foreground">
              {preview.reply}
            </div>

            {preview.promptVersion ? (
              <p className="text-xs uppercase tracking-[0.22em] text-muted">
                Versión del prompt: {preview.promptVersion}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="site-note mt-4">
            Escribe un mensaje de cliente para probar cómo respondería la IA con
            tu perfil, tu catálogo y tu base comercial.
          </p>
        )}
      </div>
    </div>
  );
}

"use client";

import { useActionState, useRef, useState } from "react";
import {
  saveSellerProfileAction,
  saveTemplateAction,
} from "@/app/app/actions";
import { FormStateMessage } from "@/components/form-state-message";
import { FormSubmitButton } from "@/components/form-submit-button";
import {
  MESSAGE_LENGTH_OPTIONS,
  SALES_STYLE_OPTIONS,
  TEMPLATE_CATEGORY_OPTIONS,
  TEMPLATE_STATUS_OPTIONS,
  TONE_OPTIONS,
} from "@/lib/domain-options";
import { INITIAL_APP_FORM_STATE } from "@/lib/form-state";
import {
  labelMessageLength,
  labelSalesStyle,
  labelTemplateCategory,
  labelTemplateStatus,
  labelTone,
} from "@/lib/labels";

function EmojiToggle({ defaultOn }: { defaultOn: boolean }) {
  const [on, setOn] = useState(defaultOn);

  return (
    <>
      <input type="hidden" name="useEmojis" value={on ? "on" : ""} />
      <button
        type="button"
        onClick={() => setOn(!on)}
        className={`relative h-5 w-9 shrink-0 rounded-full border transition-colors ${
          on ? "border-accent bg-accent" : "border-muted bg-transparent"
        }`}
      >
        <span
          className={`absolute inset-y-0 my-auto left-0.5 h-3.5 w-3.5 rounded-full transition-transform ${
            on ? "translate-x-4 bg-white" : "translate-x-0 bg-muted"
          }`}
        />
      </button>
    </>
  );
}

function PillSelect({
  name,
  options,
  defaultValue,
  labelFn,
}: {
  name: string;
  options: readonly string[];
  defaultValue: string;
  labelFn: (value: string) => string;
}) {
  const [selected, setSelected] = useState(defaultValue);

  return (
    <div className="flex flex-wrap gap-2">
      <input type="hidden" name={name} value={selected} />
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => setSelected(option)}
          className={`rounded-full border px-4 py-2 text-sm transition-colors ${
            selected === option
              ? "border-foreground bg-foreground text-background"
              : "border-line bg-transparent text-muted hover:border-muted hover:text-foreground"
          }`}
        >
          {labelFn(option)}
        </button>
      ))}
    </div>
  );
}

type SpectrumStop = {
  value: string;
  emoji: string;
  label: string;
  description: string;
};

function SpectrumSlider({
  name,
  label,
  stops,
  defaultValue,
}: {
  name: string;
  label: string;
  stops: SpectrumStop[];
  defaultValue: string;
}) {
  const defaultIndex = Math.max(0, stops.findIndex((s) => s.value === defaultValue));
  const [index, setIndex] = useState(defaultIndex);
  const trackRef = useRef<HTMLDivElement>(null);

  const handleInteraction = (clientX: number) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const snapped = Math.round(ratio * (stops.length - 1));
    setIndex(snapped);
  };

  const fillPercent = stops.length > 1 ? (index / (stops.length - 1)) * 100 : 0;
  const current = stops[index];

  return (
    <div className="overflow-hidden rounded-2xl border border-line">
      <input type="hidden" name={name} value={current.value} />

      {/* Header with question */}
      <div className="px-5 pt-5 pb-3">
        <p className="text-sm font-medium">{label}</p>
      </div>

      {/* Track area */}
      <div className="px-5 pb-4">
        <div
          ref={trackRef}
          className="relative mx-4 h-14 cursor-pointer"
          onClick={(e) => handleInteraction(e.clientX)}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (e.buttons > 0) handleInteraction(e.clientX);
          }}
        >
          {/* Rail */}
          <div className="absolute top-1/2 left-0 right-0 h-1.5 -translate-y-1/2 rounded-full bg-line" />
          {/* Fill */}
          <div
            className="absolute top-1/2 left-0 h-1.5 -translate-y-1/2 rounded-full bg-foreground transition-[width] duration-150"
            style={{ width: `${fillPercent}%` }}
          />
          {/* Thumb */}
          <div
            className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 h-5 w-5 rounded-full border-2 border-foreground bg-surface shadow-sm transition-[left] duration-150"
            style={{ left: `${fillPercent}%` }}
          />

          {/* Stops */}
          {stops.map((stop, i) => {
            const pct = stops.length > 1 ? (i / (stops.length - 1)) * 100 : 0;
            const isSelected = i === index;

            return (
              <button
                key={stop.value}
                type="button"
                onClick={() => setIndex(i)}
                className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center"
                style={{ left: `${pct}%` }}
              >
                <span
                  className={`transition-all duration-150 ${
                    isSelected ? "text-4xl" : "text-2xl opacity-75"
                  }`}
                >
                  {stop.emoji}
                </span>
              </button>
            );
          })}
        </div>

        {/* Labels under track */}
        <div className="relative mx-4 mt-1 flex justify-between">
          {stops.map((stop, i) => (
            <span
              key={stop.value}
              className={`text-xs transition-colors ${
                i === index ? "font-semibold text-foreground" : "text-muted"
              }`}
            >
              {stop.label}
            </span>
          ))}
        </div>
      </div>

      {/* Selected option display */}
      <div className="border-t border-line bg-background px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{current.emoji}</span>
          <div>
            <p className="text-sm font-semibold text-foreground">{current.label}</p>
            <p className="text-xs text-muted">{current.description}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

const TONE_STOPS: SpectrumStop[] = [
  { value: "directo", emoji: "🎯", label: "Directo", description: "Va al grano, sin rodeos." },
  { value: "profesional", emoji: "👔", label: "Profesional", description: "Formal y confiable, inspira seriedad." },
  { value: "cercano", emoji: "🤗", label: "Cercano", description: "Cálido y amigable, como hablar con un amigo." },
  { value: "divertido", emoji: "😄", label: "Divertido", description: "Relajado y con humor, rompe el hielo." },
];

const STYLE_STOPS: SpectrumStop[] = [
  { value: "educational", emoji: "📖", label: "Informativo", description: "Explica detalles y resuelve dudas." },
  { value: "balanced", emoji: "⚖️", label: "Natural", description: "Un balance de todo, se adapta al momento." },
  { value: "consultative", emoji: "🧭", label: "Asesor", description: "Guía al cliente paso a paso hasta la compra." },
  { value: "emotional", emoji: "💛", label: "Cercano", description: "Conecta emocionalmente con el cliente." },
];

const LENGTH_STOPS: SpectrumStop[] = [
  { value: "short", emoji: "💬", label: "Corta", description: "Respuestas rápidas y concisas." },
  { value: "medium", emoji: "📝", label: "Media", description: "Suficiente detalle sin abrumar." },
  { value: "long", emoji: "📄", label: "Larga", description: "Explicaciones completas y detalladas." },
];

type SellerProfileFormProps = {
  seller?: {
    seller_name: string;
    tone: string | null;
    sales_style: string;
    message_length: string;
    language_code: string;
    is_active: boolean;
    use_emojis: boolean;
    company_description: string | null;
    target_audience: string | null;
    special_instructions: string | null;
    welcome_message: string | null;
    human_handoff_message: string | null;
    purchase_confirmation_message: string | null;
    forbidden_words: string[];
  } | null;
};

export function SellerProfileForm({ seller }: SellerProfileFormProps) {
  const [state, formAction] = useActionState(
    saveSellerProfileAction,
    INITIAL_APP_FORM_STATE,
  );

  return (
    <form action={formAction} className="space-y-10">
      {/* ── Información básica ── */}
      <fieldset className="space-y-5">
        <div>
          <legend className="text-base font-semibold">Información básica</legend>
          <p className="mt-1 text-sm text-muted">
            Nombre y descripción de tu negocio para el agente.
          </p>
        </div>

        <input type="hidden" name="languageCode" value="es-DO" />
        <input type="hidden" name="isActive" value={seller?.is_active ? "on" : ""} />

        <label className="grid gap-2 text-sm font-medium">
          Nombre del vendedor
          <input
            name="sellerName"
            className="site-input"
            defaultValue={seller?.seller_name ?? "VendeTo"}
            placeholder="Ej: María Ventas"
            required
          />
        </label>

        <label className="grid gap-2 text-sm font-medium">
          Descripción del negocio
          <textarea
            name="companyDescription"
            className="site-textarea"
            defaultValue={seller?.company_description ?? ""}
            placeholder="Describe qué vende tu negocio y qué lo hace especial."
          />
          <span className="text-xs text-muted">
            El agente usa esta descripción para entender tu negocio y responder preguntas.
          </span>
        </label>

        <label className="grid gap-2 text-sm font-medium">
          Público objetivo
          <input
            name="targetAudience"
            className="site-input"
            defaultValue={seller?.target_audience ?? ""}
            placeholder="Ej: jóvenes dominicanos que compran por WhatsApp"
          />
        </label>
      </fieldset>

      {/* ── Personalidad ── */}
      <fieldset className="space-y-8">
        <div>
          <legend className="text-base font-semibold">Personalidad</legend>
          <p className="mt-1 text-sm text-muted">
            Dale forma a cómo se siente conversar con tu vendedor.
          </p>
        </div>

        <SpectrumSlider
          name="tone"
          label="¿Cómo habla tu vendedor?"
          stops={TONE_STOPS}
          defaultValue={seller?.tone ?? "cercano"}
        />

        <SpectrumSlider
          name="salesStyle"
          label="¿Cómo vende?"
          stops={STYLE_STOPS}
          defaultValue={seller?.sales_style ?? "balanced"}
        />

        <SpectrumSlider
          name="messageLength"
          label="¿Qué tan largos son sus mensajes?"
          stops={LENGTH_STOPS}
          defaultValue={seller?.message_length ?? "medium"}
        />

        <div className="flex items-center justify-between rounded-xl border border-line p-4">
          <div>
            <p className="text-sm font-medium">Usa emojis en los mensajes</p>
            <p className="mt-0.5 text-xs text-muted">
              Tu vendedor incluirá emojis para hacer la conversación más expresiva.
            </p>
          </div>
          <EmojiToggle defaultOn={seller?.use_emojis ?? true} />
        </div>

        <label className="grid gap-2 text-sm font-medium">
          Palabras prohibidas
          <input
            name="forbiddenWords"
            className="site-input"
            defaultValue={seller?.forbidden_words?.join(", ") ?? ""}
            placeholder="gratis, urgente, ..."
          />
          <span className="text-xs text-muted">
            Tu vendedor nunca usará estas palabras en sus respuestas.
          </span>
        </label>
      </fieldset>

      {/* ── Mensajes ── */}
      <fieldset className="space-y-5">
        <div>
          <legend className="text-base font-semibold">Mensajes</legend>
          <p className="mt-1 text-sm text-muted">
            Mensajes automáticos que el agente envía en momentos clave.
          </p>
        </div>

        <label className="grid gap-2 text-sm font-medium">
          Mensaje de bienvenida
          <textarea
            name="welcomeMessage"
            className="site-textarea"
            defaultValue={seller?.welcome_message ?? ""}
            placeholder="Ej: ¡Hola! Bienvenido a nuestra tienda. ¿En qué te puedo ayudar?"
          />
        </label>

        <label className="grid gap-2 text-sm font-medium">
          Confirmación de compra
          <textarea
            name="purchaseConfirmationMessage"
            className="site-textarea"
            defaultValue={seller?.purchase_confirmation_message ?? ""}
            placeholder="Ej: ¡Gracias por tu compra! Tu pedido está siendo procesado."
          />
        </label>

        <label className="grid gap-2 text-sm font-medium">
          Mensaje de handoff humano
          <textarea
            name="humanHandoffMessage"
            className="site-textarea"
            defaultValue={seller?.human_handoff_message ?? ""}
            placeholder="Ej: Te voy a conectar con un asesor que te puede ayudar mejor."
          />
          <span className="text-xs text-muted">
            Se envía cuando el agente necesita pasar la conversación a un humano.
          </span>
        </label>

        <label className="grid gap-2 text-sm font-medium">
          Instrucciones especiales
          <textarea
            name="specialInstructions"
            className="site-textarea"
            defaultValue={seller?.special_instructions ?? ""}
            placeholder="Reglas adicionales para el agente. Ej: nunca ofrecer descuentos sin aprobación."
          />
        </label>
      </fieldset>

      <FormStateMessage state={state} />
      <FormSubmitButton pendingLabel="Guardando perfil...">
        Guardar perfil de IA
      </FormSubmitButton>
    </form>
  );
}

export function TemplateForm() {
  const [state, formAction] = useActionState(
    saveTemplateAction,
    INITIAL_APP_FORM_STATE,
  );

  return (
    <form action={formAction} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium">
          Nombre
          <input name="name" className="site-input" placeholder="Ej: confirmacion_pedido" required />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Categoría
          <select name="categoryCode" className="site-input" defaultValue="utility">
            {TEMPLATE_CATEGORY_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {labelTemplateCategory(option)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Estado
          <select name="statusCode" className="site-input" defaultValue="approved">
            {TEMPLATE_STATUS_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {labelTemplateStatus(option)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Idioma
          <input
            name="languageCode"
            className="site-input"
            defaultValue="es_DO"
          />
        </label>
      </div>

      <label className="grid gap-2 text-sm font-medium">
        Texto principal
        <textarea
          name="bodyText"
          className="site-textarea"
          placeholder="Hola, tu pedido está listo. Aquí tienes el enlace para completar el pago."
        />
      </label>

      <label className="grid gap-2 text-sm font-medium">
        Variables dinámicas
        <input
          name="variablesList"
          className="site-input"
          placeholder="nombre_cliente, monto, enlace_pago"
        />
        <span className="text-xs text-muted">
          Separa las variables con comas.
        </span>
      </label>

      <FormStateMessage state={state} />
      <FormSubmitButton pendingLabel="Guardando plantilla...">
        Guardar plantilla
      </FormSubmitButton>
    </form>
  );
}

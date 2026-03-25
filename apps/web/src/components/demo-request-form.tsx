"use client";

import { useActionState } from "react";
import { submitDemoRequestAction } from "@/app/demo/actions";
import { FormStateMessage } from "@/components/form-state-message";
import { FormSubmitButton } from "@/components/form-submit-button";
import { INITIAL_APP_FORM_STATE } from "@/lib/form-state";

export function DemoRequestForm() {
  const [state, formAction] = useActionState(
    submitDemoRequestAction,
    INITIAL_APP_FORM_STATE,
  );

  return (
    <form action={formAction} className="site-form-grid">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium">
          Nombre del negocio
          <input className="site-input" name="businessName" required />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Persona de contacto
          <input className="site-input" name="contactName" required />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Correo
          <input className="site-input" name="email" type="email" required />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          WhatsApp
          <input
            className="site-input"
            name="whatsapp"
            type="tel"
            placeholder="+18095551234"
            required
          />
        </label>
      </div>

      <label className="grid gap-2 text-sm font-medium">
        ¿Qué quieres resolver primero con VendeTo?
        <textarea
          className="site-textarea"
          name="useCase"
          placeholder="Ej: responder preguntas del catálogo, enviar links de pago y hacer takeover humano cuando el cliente esté listo para comprar."
          required
        />
      </label>

      <FormStateMessage state={state} />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <FormSubmitButton pendingLabel="Enviando solicitud...">
          Enviar solicitud
        </FormSubmitButton>
        <span className="text-sm leading-7 text-muted">
          Te contactaremos para revisar tu operación actual y definir el onboarding.
        </span>
      </div>
    </form>
  );
}

"use client";

import type { ReactNode } from "react";
import { useActionState } from "react";
import {
  saveOrganizationSettingsAction,
  saveWhatsAppChannelAction,
} from "@/app/app/actions";
import { FormStateMessage } from "@/components/form-state-message";
import { FormSubmitButton } from "@/components/form-submit-button";
import { INITIAL_APP_FORM_STATE } from "@/lib/form-state";
type OrganizationSettingsFormProps = {
  organization: {
    name: string;
    defaultLocale: string;
    timezone: string;
    currencyCode: string;
    industry: string | null;
  };
};

type WhatsAppChannelFormProps = {
  channel?: {
    phone_e164: string;
    display_name: string | null;
  } | null;
  connectionStatus?: string;
  connectionAction?: ReactNode;
  connectionHint?: string;
};

export function OrganizationSettingsForm({
  organization,
}: OrganizationSettingsFormProps) {
  const [state, formAction] = useActionState(
    saveOrganizationSettingsAction,
    INITIAL_APP_FORM_STATE,
  );

  return (
    <form action={formAction} className="space-y-6 border-t border-line pt-6">
      <div className="grid gap-4 lg:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium">
          Nombre del negocio
          <input
            name="name"
            className="site-input"
            defaultValue={organization.name}
            required
          />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Industria
          <input
            name="industry"
            className="site-input"
            defaultValue={organization.industry ?? ""}
          />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Idioma base
          <input
            name="defaultLocale"
            className="site-input"
            defaultValue={organization.defaultLocale}
          />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Zona horaria
          <input
            name="timezone"
            className="site-input"
            defaultValue={organization.timezone}
          />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Moneda
          <input
            name="currencyCode"
            className="site-input"
            defaultValue={organization.currencyCode}
          />
        </label>
      </div>

      <FormStateMessage state={state} />
      <FormSubmitButton pendingLabel="Guardando negocio...">
        Guardar negocio
      </FormSubmitButton>
    </form>
  );
}

export function WhatsAppChannelForm({
  channel,
  connectionStatus,
  connectionAction,
  connectionHint,
}: WhatsAppChannelFormProps) {
  const [state, formAction] = useActionState(
    saveWhatsAppChannelAction,
    INITIAL_APP_FORM_STATE,
  );

  return (
    <div className="space-y-6 border-t border-line pt-6">
      {(connectionStatus || connectionAction || connectionHint) && (
        <div className="surface-card border border-line p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="text-sm font-semibold">Conexión Kapso</p>
              {connectionStatus ? (
                <p className="text-sm leading-6 text-muted">{connectionStatus}</p>
              ) : null}
            </div>
            {connectionAction ? <div>{connectionAction}</div> : null}
          </div>
          {connectionHint ? (
            <p className="mt-3 text-sm leading-7 text-muted">{connectionHint}</p>
          ) : null}
        </div>
      )}

      <form action={formAction} className="space-y-6">
        <div className="grid gap-4 lg:grid-cols-2">
          <label className="grid gap-2 text-sm font-medium">
            Número de WhatsApp
            <input
              name="phoneE164"
              className="site-input"
              defaultValue={channel?.phone_e164 ?? ""}
              placeholder="+18095551234"
              required
            />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            Nombre para mostrar
            <input
              name="displayName"
              className="site-input"
              defaultValue={channel?.display_name ?? ""}
            />
          </label>
        </div>

        <p className="text-sm leading-7 text-muted">
          El estado real del canal, la calidad del número y los identificadores
          oficiales se completan automáticamente cuando la conexión esté activa
          para este entorno.
        </p>

        <FormStateMessage state={state} />
        <FormSubmitButton pendingLabel="Guardando canal...">
          Guardar canal de WhatsApp
        </FormSubmitButton>
      </form>
    </div>
  );
}

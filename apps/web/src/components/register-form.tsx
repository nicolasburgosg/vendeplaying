"use client";

import { useActionState } from "react";
import { registerAction } from "@/app/registro/actions";
import { AuthSubmitButton } from "@/components/auth-submit-button";
import { INITIAL_AUTH_FORM_STATE } from "@/lib/auth/forms";

export function RegisterForm() {
  const [state, formAction] = useActionState(registerAction, INITIAL_AUTH_FORM_STATE);
  const fields = state?.fields ?? {};
  const message = state?.message;
  const status = state?.status ?? "idle";

  return (
    <form action={formAction} className="mt-8">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium">
          Nombre completo
          <input
            name="fullName"
            className="site-input"
            placeholder="Nombre completo"
            type="text"
            autoComplete="name"
            defaultValue={fields.fullName ?? ""}
            required
          />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Nombre del negocio
          <input
            name="organizationName"
            className="site-input"
            placeholder="Nombre del negocio"
            type="text"
            defaultValue={fields.organizationName ?? ""}
            required
          />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Correo
          <input
            name="email"
            className="site-input"
            placeholder="tu@negocio.com"
            type="email"
            autoComplete="email"
            defaultValue={fields.email ?? ""}
            required
          />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Contraseña
          <input
            name="password"
            className="site-input"
            placeholder="Mínimo 8 caracteres"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </label>
      </div>

      {message ? (
        <div
          className={`mt-4 rounded-lg px-4 py-3 text-sm leading-6 ${
            status === "success"
              ? "border border-success/20 bg-success/10 text-success"
              : "border border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {message}
        </div>
      ) : null}

      <AuthSubmitButton
        pendingLabel="Creando cuenta..."
        className="site-button mt-6 disabled:cursor-not-allowed disabled:opacity-70"
      >
        Crear cuenta
      </AuthSubmitButton>
    </form>
  );
}

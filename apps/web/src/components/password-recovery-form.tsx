"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestPasswordResetAction } from "@/app/login/actions";
import { AuthSubmitButton } from "@/components/auth-submit-button";
import { INITIAL_AUTH_FORM_STATE } from "@/lib/auth/forms";

export function PasswordRecoveryForm() {
  const [state, formAction] = useActionState(
    requestPasswordResetAction,
    INITIAL_AUTH_FORM_STATE,
  );
  const fields = state?.fields ?? {};
  const message = state?.message;
  const status = state?.status ?? "idle";

  return (
    <form action={formAction} className="mt-8">
      <div className="site-form-grid">
        <label className="grid gap-2 text-sm font-medium">
          Correo de la cuenta
          <input
            type="email"
            name="email"
            defaultValue={fields.email ?? ""}
            className="site-input"
            placeholder="tu@negocio.com"
            autoComplete="email"
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
        pendingLabel="Enviando enlace..."
        className="site-button mt-6 w-full disabled:cursor-not-allowed disabled:opacity-70"
      >
        Enviar enlace
      </AuthSubmitButton>

      <p className="mt-4 text-sm text-muted">
        ¿Ya recuperaste el acceso?{" "}
        <Link href="/login" className="font-semibold text-accent-strong">
          Volver a login
        </Link>
      </p>
    </form>
  );
}

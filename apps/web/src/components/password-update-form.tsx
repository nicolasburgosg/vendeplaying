"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { validatePassword } from "@/lib/auth/forms";
import { createClient } from "@/lib/supabase/client";

type SetupState = "checking" | "ready" | "invalid";
type MessageState =
  | {
      kind: "error" | "success";
      text: string;
    }
  | null;

export function PasswordUpdateForm() {
  const supabase = useMemo(() => createClient(), []);
  const [setupState, setSetupState] = useState<SetupState>("checking");
  const [message, setMessage] = useState<MessageState>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled || !session?.user) {
        return;
      }

      setMessage(null);
      setSetupState("ready");
    });

    async function prepareRecoverySession() {
      setSetupState("checking");
      setMessage(null);

      const currentUrl = new URL(window.location.href);
      const tokenHash = currentUrl.searchParams.get("token_hash");
      const type = currentUrl.searchParams.get("type");

      if (tokenHash && type === "recovery") {
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: "recovery",
        });

        if (cancelled) {
          return;
        }

        if (error) {
          setSetupState("invalid");
          setMessage({
            kind: "error",
            text: "Este enlace ya expiró o no es válido. Solicita otro para cambiar la contraseña.",
          });
          return;
        }

        currentUrl.searchParams.delete("token_hash");
        currentUrl.searchParams.delete("type");
        window.history.replaceState({}, "", currentUrl.toString());
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      const currentUser =
        session?.user ??
        (await supabase.auth.getUser()).data.user ??
        null;

      if (cancelled) {
        return;
      }

      if (!currentUser) {
        setSetupState("invalid");
        setMessage({
          kind: "error",
          text: "Tu sesión de recuperación no está disponible. Solicita otro enlace para cambiar la contraseña.",
        });
        return;
      }

      setSetupState("ready");
    }

    prepareRecoverySession().catch(() => {
      if (cancelled) {
        return;
      }

      setSetupState("invalid");
      setMessage({
        kind: "error",
        text: "No pudimos validar tu enlace de recuperación. Solicita otro para intentarlo de nuevo.",
      });
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [supabase]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!validatePassword(password)) {
      setMessage({
        kind: "error",
        text: "La nueva contraseña debe tener al menos 8 caracteres.",
      });
      return;
    }

    if (password !== confirmPassword) {
      setMessage({
        kind: "error",
        text: "La confirmación no coincide con la nueva contraseña.",
      });
      return;
    }

    setSubmitting(true);
    setMessage(null);

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setSubmitting(false);
      setMessage({
        kind: "error",
        text: "No pudimos guardar la nueva contraseña. Solicita otro enlace o inténtalo de nuevo.",
      });
      return;
    }

    setMessage({
      kind: "success",
      text: "Contraseña actualizada. Entrando al panel...",
    });
    window.location.assign("/app");
  }

  if (setupState === "checking") {
    return (
      <div className="mt-8 rounded-lg border border-line bg-surface px-4 py-3 text-sm text-muted">
        Confirmando tu enlace de recuperación...
      </div>
    );
  }

  if (setupState === "invalid") {
    return (
      <div className="mt-8">
        {message ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">
            {message.text}
          </div>
        ) : null}
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/recuperar-contrasena" className="site-button">
            Pedir otro enlace
          </Link>
          <Link href="/login" className="site-button-secondary">
            Volver a login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8">
      <div className="site-form-grid">
        <label className="grid gap-2 text-sm font-medium">
          Nueva contraseña
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="site-input"
            placeholder="Mínimo 8 caracteres"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Confirmar contraseña
          <input
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            className="site-input"
            placeholder="Repite tu nueva contraseña"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </label>
      </div>

      {message ? (
        <div
          className={`mt-4 rounded-lg px-4 py-3 text-sm leading-6 ${
            message.kind === "success"
              ? "border border-success/20 bg-success/10 text-success"
              : "border border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {message.text}
        </div>
      ) : null}

      <button
        type="submit"
        className="site-button mt-6 w-full disabled:cursor-not-allowed disabled:opacity-70"
        disabled={submitting}
      >
        {submitting ? "Guardando..." : "Guardar nueva contraseña"}
      </button>
    </form>
  );
}

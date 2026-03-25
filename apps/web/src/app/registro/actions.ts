"use server";

import { redirect } from "next/navigation";
import {
  normalizeEmail,
  normalizeText,
  validatePassword,
  type AuthFormState,
} from "@/lib/auth/forms";
import { ensureOrganizationForUser } from "@/lib/organization";
import { getSiteUrl } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export async function registerAction(
  _previousState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const fullName = normalizeText(formData.get("fullName"));
  const organizationName = normalizeText(formData.get("organizationName"));
  const email = normalizeEmail(formData.get("email"));
  const rawPassword = formData.get("password");
  const password = typeof rawPassword === "string" ? rawPassword : "";

  if (!fullName || !organizationName || !email || !password) {
    return {
      status: "error",
      message: "Completa nombre, negocio, correo y contraseña para abrir tu cuenta.",
      fields: { fullName, organizationName, email },
    };
  }

  if (!validatePassword(password)) {
    return {
      status: "error",
      message: "La contraseña debe tener al menos 8 caracteres.",
      fields: { fullName, organizationName, email },
    };
  }

  const supabase = await createClient();
  const emailRedirectTo = `${getSiteUrl()}/auth/confirm?next=/app`;

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo,
      data: {
        full_name: fullName,
        name: fullName,
        organization_name: organizationName,
      },
    },
  });

  if (error) {
    return {
      status: "error",
      message: "No pudimos crear tu cuenta. Revisa los datos e inténtalo de nuevo.",
      fields: { fullName, organizationName, email },
    };
  }

  if (!data.user) {
    return {
      status: "error",
      message: "No recibimos un usuario válido desde Auth.",
      fields: { fullName, organizationName, email },
    };
  }

  if (!data.session) {
    return {
      status: "success",
      message:
        "Tu cuenta fue creada. Revisa tu correo para confirmar el acceso y terminar el alta del negocio.",
      fields: { fullName, organizationName, email },
    };
  }

  await ensureOrganizationForUser(supabase, data.user, organizationName);

  redirect("/app");
}

"use server";

import { redirect } from "next/navigation";
import {
  normalizeEmail,
  validatePassword,
  type AuthFormState,
} from "@/lib/auth/forms";
import { createClient } from "@/lib/supabase/server";

export async function loginAction(
  _previousState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = normalizeEmail(formData.get("email"));
  const rawPassword = formData.get("password");
  const password = typeof rawPassword === "string" ? rawPassword : "";

  if (!email || !password) {
    return {
      status: "error",
      message: "Completa tu correo y tu contraseña para entrar.",
      fields: { email },
    };
  }

  if (!validatePassword(password)) {
    return {
      status: "error",
      message: "La contraseña debe tener al menos 8 caracteres.",
      fields: { email },
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return {
      status: "error",
      message: "No pudimos iniciar sesión con esas credenciales.",
      fields: { email },
    };
  }

  redirect("/app");
}

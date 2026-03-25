"use server";

import type { AppFormState } from "@/lib/form-state";
import {
  normalizeEmail,
  normalizeText,
} from "@/lib/form-state";
import { createClient } from "@/lib/supabase/server";

export async function submitDemoRequestAction(
  _previousState: AppFormState,
  formData: FormData,
): Promise<AppFormState> {
  const businessName = normalizeText(formData.get("businessName"));
  const contactName = normalizeText(formData.get("contactName"));
  const email = normalizeEmail(formData.get("email"));
  const whatsapp = normalizeText(formData.get("whatsapp"));
  const useCase = normalizeText(formData.get("useCase"));

  if (!businessName || !contactName || !email || !whatsapp || !useCase) {
    return {
      status: "error",
      message: "Completa negocio, contacto, correo, WhatsApp y el objetivo de la demo.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("demo_requests").insert({
    business_name: businessName,
    contact_name: contactName,
    email,
    whatsapp_e164: whatsapp,
    use_case: useCase,
  });

  if (error) {
    return {
      status: "error",
      message: "No pudimos guardar la solicitud ahora mismo. Inténtalo otra vez.",
    };
  }

  return {
    status: "success",
    message: "Solicitud recibida. Te contactaremos para coordinar la demo.",
  };
}

import type { Database } from "@/lib/supabase/database.types";

type SellerProfileRow = Database["public"]["Tables"]["ai_seller_profiles"]["Row"];
type ChannelRow = Database["public"]["Tables"]["whatsapp_channels"]["Row"];
type PaymentConfigRow =
  Database["public"]["Tables"]["organization_payment_configs"]["Row"];

export type ReadinessState = "unconfigured" | "partial" | "ready";

export type ReadinessBlock = {
  state: ReadinessState;
  label: string;
  detail: string;
  blockers: string[];
};

export type ReadinessReport = {
  ai: ReadinessBlock;
  whatsapp: ReadinessBlock;
  payments: ReadinessBlock;
};

function hasKapsoEnvironment() {
  return Boolean(process.env.VENDETO_KAPSO_API_KEY);
}

function getAiReadiness(sellerProfile: SellerProfileRow | null): ReadinessBlock {
  const blockers: string[] = [];

  if (!process.env.OPENAI_API_KEY) {
    blockers.push("Falta la llave OPENAI_API_KEY en este entorno.");
  }

  if (!sellerProfile) {
    blockers.push("Todavía no existe un perfil de IA vendedora.");
  } else if (!sellerProfile.is_active) {
    blockers.push("El perfil de IA está pausado.");
  }

  if (blockers.length === 0) {
    return {
      state: "ready",
      label: "Lista",
      detail: "La IA puede generar borradores y resúmenes en este entorno.",
      blockers,
    };
  }

  return {
    state: sellerProfile ? "partial" : "unconfigured",
    label: sellerProfile ? "Parcial" : "Sin configurar",
    detail:
      sellerProfile
        ? "La lógica está lista, pero falta completar la configuración del entorno."
        : "Configura primero el perfil comercial para habilitar la IA.",
    blockers,
  };
}

function getWhatsAppReadiness(channel: ChannelRow | null): ReadinessBlock {
  const blockers: string[] = [];

  if (!channel) {
    blockers.push("No hay un canal de WhatsApp creado para este negocio.");
  } else {
    if (channel.status !== "connected") {
      blockers.push("El canal todavía no termina su conexión en Kapso.");
    }

    if (!channel.provider_phone_number_id) {
      blockers.push("Falta el identificador operativo del número en Kapso.");
    }
  }

  if (!hasKapsoEnvironment()) {
    blockers.push("Falta VENDETO_KAPSO_API_KEY en este entorno.");
  }

  if (blockers.length === 0) {
    return {
      state: "ready",
      label: "Lista",
      detail: "El canal puede enviar tráfico real por Kapso en este entorno.",
      blockers,
    };
  }

  return {
    state: channel ? "partial" : "unconfigured",
    label: channel ? "Parcial" : "Sin configurar",
    detail:
      channel
        ? "El flujo comercial está visible, pero el último tramo sigue bloqueado por configuración de Kapso."
        : "Crea el canal y termina la conexión oficial con Kapso para habilitar mensajes reales.",
    blockers,
  };
}

function configNeedsSecret(config: PaymentConfigRow) {
  return !["manual", "cash_on_delivery", "bank_transfer"].includes(config.provider_code);
}

function getPaymentsReadiness(paymentConfigs: PaymentConfigRow[]): ReadinessBlock {
  const activeConfigs = paymentConfigs.filter((config) => config.is_enabled);
  const blockers: string[] = [];

  if (activeConfigs.length === 0) {
    blockers.push("No hay un proveedor de pagos activo.");
  }

  activeConfigs.forEach((config) => {
    if (configNeedsSecret(config) && !config.vault_secret_ref) {
      blockers.push(
        `La configuración ${config.provider_code} / ${config.method_type_code} no tiene secretos cargados.`,
      );
    }
  });

  if (blockers.length === 0) {
    return {
      state: "ready",
      label: "Listos",
      detail: "VendeTo puede intentar crear enlaces de pago reales para el método por defecto.",
      blockers,
    };
  }

  return {
    state: activeConfigs.length > 0 ? "partial" : "unconfigured",
    label: activeConfigs.length > 0 ? "Parcial" : "Sin configurar",
    detail:
      activeConfigs.length > 0
        ? "El flujo comercial está modelado, pero faltan secretos o credenciales del proveedor."
        : "Activa al menos un método de cobro para preparar el checkout.",
    blockers,
  };
}

export function getReadinessReport(params: {
  sellerProfile: SellerProfileRow | null;
  channel: ChannelRow | null;
  paymentConfigs: PaymentConfigRow[];
}) {
  return {
    ai: getAiReadiness(params.sellerProfile),
    whatsapp: getWhatsAppReadiness(params.channel),
    payments: getPaymentsReadiness(params.paymentConfigs),
  } satisfies ReadinessReport;
}

export function readinessTone(state: ReadinessState) {
  switch (state) {
    case "ready":
      return "success" as const;
    case "partial":
      return "warning" as const;
    default:
      return "danger" as const;
  }
}

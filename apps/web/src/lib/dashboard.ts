import { redirect } from "next/navigation";
import { ensureOrganizationForUser, getActiveMembership } from "@/lib/organization";
import { createClient } from "@/lib/supabase/server";

const ACTIVE_CONVERSATION_STATUSES = [
  "open",
  "waiting_customer",
  "waiting_human",
  "awaiting_payment",
  "paid",
];

function getChannelStatusLabel(status?: string | null) {
  switch (status) {
    case "connected":
      return "WhatsApp conectado";
    case "pending_verification":
      return "WhatsApp pendiente de conexión";
    case "paused":
      return "Canal pausado";
    case "error":
      return "Canal con error";
    case "disconnected":
      return "Canal desconectado";
    default:
      return "WhatsApp sin configurar";
  }
}

export async function getDashboardData() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/login");
  }

  let membership = await getActiveMembership(supabase, user.id);

  if (!membership) {
    await ensureOrganizationForUser(supabase, user);
    membership = await getActiveMembership(supabase, user.id);
  }

  if (!membership) {
    redirect("/registro");
  }

  const organizationId = membership.organization_id;

  const [
    organizationResult,
    profileResult,
    sellerResult,
    channelResult,
    conversationsResult,
    hotLeadsResult,
    paidOrdersResult,
  ] = await Promise.all([
    supabase
      .from("organizations")
      .select("id, name, slug")
      .eq("id", organizationId)
      .single(),
    supabase
      .from("user_profiles")
      .select("full_name")
      .eq("id", user.id)
      .single(),
    supabase
      .from("ai_seller_profiles")
      .select("seller_name, tone, language_code")
      .eq("organization_id", organizationId)
      .maybeSingle(),
    supabase
      .from("whatsapp_channels")
      .select("status, phone_e164, display_name")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("conversations")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .in("status", ACTIVE_CONVERSATION_STATUSES),
    supabase
      .from("customers")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("lead_temperature", "hot"),
    supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("payment_status", "paid"),
  ]);

  if (organizationResult.error) {
    throw new Error(organizationResult.error.message);
  }

  if (profileResult.error) {
    throw new Error(profileResult.error.message);
  }

  return {
    user: {
      id: user.id,
      email: user.email ?? "sin-correo",
      fullName: profileResult.data.full_name ?? "Merchant",
    },
    organization: {
      id: organizationResult.data.id,
      name: organizationResult.data.name,
      slug: organizationResult.data.slug,
      role: membership.role,
    },
    sellerProfile: sellerResult.data,
    channel: channelResult.data,
    cards: [
      {
        title: "Conversaciones activas",
        value: conversationsResult.count ?? 0,
        detail: "Visibilidad rápida del inbox y takeover humano.",
      },
      {
        title: "Leads calientes",
        value: hotLeadsResult.count ?? 0,
        detail: "Clientes listos para seguimiento comercial.",
      },
      {
        title: "Órdenes pagadas",
        value: paidOrdersResult.count ?? 0,
        detail: "Cobros confirmados desde el flujo de pago.",
      },
    ],
    channelStatusLabel: getChannelStatusLabel(channelResult.data?.status),
  };
}

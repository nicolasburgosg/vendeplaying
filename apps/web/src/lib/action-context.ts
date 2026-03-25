import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getActiveMembership } from "@/lib/organization";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export async function getActionContext() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("Tu sesión expiró. Vuelve a entrar.");
  }

  const membership = await getActiveMembership(supabase, user.id);

  if (!membership) {
    throw new Error("No tienes una organización activa.");
  }

  return {
    supabase,
    user,
    organizationId: membership.organization_id,
    membershipRole: membership.role,
  };
}

export async function getPrimaryChannelId(
  supabase: SupabaseServerClient,
  organizationId: string,
) {
  const { data, error } = await supabase
    .from("whatsapp_channels")
    .select("id")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data?.id ?? null;
}

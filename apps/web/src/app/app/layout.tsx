import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { getMerchantContext } from "@/lib/merchant";
import { createClient } from "@/lib/supabase/server";

async function getSidebarCounts(organizationId: string) {
  const supabase = await createClient();

  const [inboxResult, pedidosResult] = await Promise.all([
    supabase
      .from("conversations")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .in("status", ["open", "waiting_customer", "waiting_human", "awaiting_payment"]),
    supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .in("status", ["pending", "confirmed"]),
  ]);

  return {
    inboxCount: inboxResult.count ?? 0,
    pedidosCount: pedidosResult.count ?? 0,
  };
}

export default async function MerchantAppLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const context = await getMerchantContext();
  const { inboxCount, pedidosCount } = await getSidebarCounts(
    context.organization.id,
  );

  return (
    <AppShell
      organizationName={context.organization.name}
      organizationSlug={context.organization.slug}
      userName={context.user.fullName}
      userEmail={context.user.email}
      membershipRole={context.organization.role}
      channelStatusLabel={context.channelStatusLabel}
      inboxCount={inboxCount}
      pedidosCount={pedidosCount}
    >
      {children}
    </AppShell>
  );
}

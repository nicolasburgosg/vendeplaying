import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { getMerchantContext } from "@/lib/merchant";

export default async function MerchantAppLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const context = await getMerchantContext();

  return (
    <AppShell
      organizationName={context.organization.name}
      organizationSlug={context.organization.slug}
      userName={context.user.fullName}
      userEmail={context.user.email}
      membershipRole={context.organization.role}
      channelStatusLabel={context.channelStatusLabel}
    >
      {children}
    </AppShell>
  );
}

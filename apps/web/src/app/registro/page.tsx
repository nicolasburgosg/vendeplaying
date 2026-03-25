import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { RegisterForm } from "@/components/register-form";
import { IllustrationSlot } from "@/components/illustration-slot";
import { createClient } from "@/lib/supabase/server";

export default async function RegisterPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/app");
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <SiteHeader />

      <section className="site-section">
        <div className="site-shell flex justify-center">
          <div className="w-full max-w-lg">
            <div className="flex items-center gap-4">
              <IllustrationSlot width={120} height={120} label="Nuevo negocio" />
              <div>
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                  Abre tu negocio en VendeTo&apos;
                </h1>
                <p className="mt-2 text-sm text-muted">
                  Crea tu cuenta para conectar WhatsApp, configurar tu agente de
                  IA y empezar a vender.
                </p>
              </div>
            </div>

            <div className="surface-card mt-8 p-6 sm:p-8">
              <RegisterForm />
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}

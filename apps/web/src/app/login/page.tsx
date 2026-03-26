import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { LoginForm } from "@/components/login-form";
import { IllustrationSlot } from "@/components/illustration-slot";
import { createClient } from "@/lib/supabase/server";

export default async function LoginPage() {
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
          <div className="w-full max-w-md">
            <div className="flex items-center gap-4">
              <IllustrationSlot width={120} height={120} label="Bienvenido" />
              <div>
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                  Entra a tu operación
                </h1>
                <p className="mt-2 text-sm text-muted">
                  Usa el correo y contraseña de tu negocio para acceder al
                  panel.
                </p>
              </div>
            </div>

            <div className="surface-card mt-8 p-6">
              <LoginForm />
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}

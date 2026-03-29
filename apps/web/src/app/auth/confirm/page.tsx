import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { IllustrationSlot } from "@/components/illustration-slot";
import { AuthConfirmForm } from "@/components/auth-confirm-form";

export default function AuthConfirmPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <SiteHeader />

      <section className="site-section">
        <div className="site-shell flex justify-center">
          <div className="w-full max-w-md">
            <div className="flex items-center gap-4">
              <IllustrationSlot width={120} height={120} label="Confirmar acceso" />
              <div>
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                  Confirmando tu acceso
                </h1>
                <p className="mt-2 text-sm text-muted">
                  Estamos validando tu enlace para llevarte al panel del negocio.
                </p>
              </div>
            </div>

            <div className="surface-card mt-8 p-6">
              <AuthConfirmForm />
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}

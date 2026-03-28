import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { IllustrationSlot } from "@/components/illustration-slot";
import { PasswordUpdateForm } from "@/components/password-update-form";

export default function PasswordUpdatePage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <SiteHeader />

      <section className="site-section">
        <div className="site-shell flex justify-center">
          <div className="w-full max-w-md">
            <div className="flex items-center gap-4">
              <IllustrationSlot width={120} height={120} label="Nueva contraseña" />
              <div>
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                  Crea una nueva contraseña
                </h1>
                <p className="mt-2 text-sm text-muted">
                  Confirma el enlace de recuperación y define una contraseña
                  nueva para volver al panel.
                </p>
              </div>
            </div>

            <div className="surface-card mt-8 p-6">
              <PasswordUpdateForm />
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}

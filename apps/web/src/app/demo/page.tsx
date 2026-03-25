import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { DemoRequestForm } from "@/components/demo-request-form";
import { IllustrationSlot } from "@/components/illustration-slot";

const checklist = [
  "Como vendes hoy por WhatsApp y cuantas conversaciones manejas.",
  "Si necesitas takeover humano, pagos por enlace y recordatorios automaticos.",
  "Que catalogo, FAQs y reglas comerciales deben entrar primero al sistema.",
];

export default function DemoPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <SiteHeader />

      <section className="site-section">
        <div className="site-shell grid items-start gap-12 lg:grid-cols-[0.9fr_1.1fr]">
          {/* Left: info */}
          <div className="space-y-8">
            <div>
              <p className="site-kicker">Solicitar demo</p>
              <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
                Muestranos como vendes hoy y te ensenamos como seria con
                VendeTo&apos;
              </h1>
              <p className="site-lead mt-5 max-w-none">
                Agenda una revision comercial de tu operacion actual. Usaremos
                esta informacion para preparar un demo centrado en tu catalogo,
                tus cobros y tu forma real de vender por chat.
              </p>
            </div>

            <div>
              <p className="site-kicker">Que vamos a revisar</p>
              <ul className="mt-4 space-y-3">
                {checklist.map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm leading-relaxed text-muted">
                    <svg
                      className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-primary"
                      fill="none"
                      viewBox="0 0 16 16"
                    >
                      <path
                        d="M3.5 8.5l3 3 6-7"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <IllustrationSlot
              width={320}
              height={240}
              label="Ilustracion: Consulta comercial"
            />
          </div>

          {/* Right: form */}
          <div className="surface-card p-6 sm:p-8">
            <h2 className="text-lg font-semibold">Solicita tu demo</h2>
            <p className="mt-1 text-sm text-muted">
              Te contactaremos para revisar tu operacion actual.
            </p>
            <div className="mt-6">
              <DemoRequestForm />
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}

import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

const sections = [
  {
    title: "Terminos de servicio",
    content:
      "El uso de VendeTo' requiere informacion veraz del negocio, uso autorizado del canal y cumplimiento de las politicas del proveedor de mensajeria y del proveedor de pagos conectado.",
  },
  {
    title: "Privacidad y tratamiento de datos",
    content:
      "Procesamos datos de negocio, contactos y conversaciones para operar el panel, automatizar respuestas y dar visibilidad comercial al negocio.",
  },
  {
    title: "Uso de WhatsApp y canales conectados",
    content:
      "La mensajeria depende del canal oficial conectado por el negocio. El negocio es responsable del contenido, consentimiento y politicas aplicables a sus campanas y recordatorios.",
  },
  {
    title: "Pagos, enlaces externos y responsabilidades del negocio",
    content:
      "Los enlaces de pago y estados comerciales dependen del proveedor configurado. VendeTo' no custodia fondos ni reemplaza las obligaciones del negocio frente a sus clientes.",
  },
  {
    title: "Entidad legal",
    content:
      "VendeTo es operado por VendeTo LLC, con direccion comercial en 301 West Ave, Unit 1307, Austin, TX 78701, Estados Unidos.",
  },
];

export default function LegalPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <SiteHeader />

      <section className="site-section">
        <div className="site-shell max-w-3xl">
          <p className="site-kicker">Legal</p>
          <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
            Terminos, privacidad y uso responsable del canal comercial
          </h1>
          <p className="site-lead mt-5">
            Las reglas base de uso, manejo de datos y operacion de pagos y
            mensajeria dentro de VendeTo&apos;.
          </p>
        </div>
      </section>

      <section className="pb-16">
        <div className="site-shell max-w-3xl space-y-6">
          {sections.map((section) => (
            <div key={section.title} className="surface-card p-6">
              <h2 className="text-lg font-semibold">{section.title}</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted">
                {section.content}
              </p>
            </div>
          ))}
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}

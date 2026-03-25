import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { PricingCard } from "@/components/pricing-card";
import { FaqAccordion } from "@/components/faq-accordion";
import type { PricingPlan } from "@/components/pricing-card";
import type { FaqItem } from "@/components/faq-accordion";

const plans: PricingPlan[] = [
  {
    name: "Comercial",
    tag: "Popular",
    price: "Cotizacion personalizada",
    description:
      "Para negocios que quieren vender por WhatsApp con IA, inbox humano y cobros por enlace.",
    features: [
      "1 negocio conectado",
      "Conexion oficial de WhatsApp",
      "IA vendedora configurable",
      "Inbox en vivo con takeover",
      "Catalogo y FAQs",
      "Cobros por enlace de Azul",
      "Seguimiento automatico",
    ],
    cta: { label: "Solicitar propuesta", href: "/demo" },
    variant: "light",
    illustration: "Ilustracion: Plan Comercial",
  },
  {
    name: "Escala",
    price: "Cotizacion personalizada",
    description:
      "Para operaciones con mayor volumen que necesitan soporte dedicado y evolucion continua.",
    features: [
      "Todo lo del plan Comercial",
      "Acompanamiento de integracion",
      "Ajustes operativos dedicados",
      "Ampliacion progresiva de modulos",
      "Soporte prioritario",
    ],
    cta: { label: "Hablar con el equipo", href: "/demo" },
    variant: "dark",
    illustration: "Ilustracion: Plan Escala",
  },
];

const faqs: FaqItem[] = [
  {
    question: "Como se define el precio?",
    answer:
      "La propuesta comercial se define segun volumen de conversaciones, complejidad de catalogo y necesidad de takeover humano. Agenda una demo para recibir una cotizacion personalizada.",
  },
  {
    question: "Necesito ayuda para conectar WhatsApp?",
    answer:
      "No. La conexion de WhatsApp se gestiona desde Kapso y el equipo de VendeTo' te acompana durante el proceso de configuracion y puesta en marcha.",
  },
  {
    question: "Puedo probar antes de contratar?",
    answer:
      "Si. Ofrecemos demos personalizadas donde revisamos tu operacion actual y mostramos como funcionaria tu negocio dentro de VendeTo'.",
  },
  {
    question: "Que metodos de pago soportan?",
    answer:
      "Actualmente generamos enlaces de pago a traves de Azul, el procesador de pagos lider en Republica Dominicana.",
  },
  {
    question: "Puedo tomar control de la conversacion manualmente?",
    answer:
      "Si. El inbox permite takeover humano en cualquier momento. Puedes pausar la IA, responder manualmente y reactivarla sin perder el contexto de la conversacion.",
  },
];

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <SiteHeader />

      {/* Hero */}
      <section className="site-section">
        <div className="site-shell max-w-3xl">
          <p className="site-kicker">Precios</p>
          <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
            Precios que se ajustan a tu operacion
          </h1>
          <p className="site-lead mt-5">
            Trabajamos con una propuesta comercial basada en tu uso real —
            conversaciones, catalogo, cobros y nivel de acompanamiento.
          </p>
        </div>
      </section>

      {/* Pricing cards */}
      <section className="pb-16">
        <div className="site-shell grid gap-8 lg:grid-cols-2">
          {plans.map((plan) => (
            <PricingCard key={plan.name} plan={plan} />
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="site-section border-t border-line">
        <div className="site-shell max-w-3xl">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Preguntas frecuentes
          </h2>
          <div className="mt-8">
            <FaqAccordion items={faqs} />
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}

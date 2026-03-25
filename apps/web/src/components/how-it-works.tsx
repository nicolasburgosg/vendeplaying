"use client";

import { useRef } from "react";
import { motion, useInView } from "motion/react";
import { ArrowCTA } from "@/components/arrow-cta";

const steps = [
  {
    number: "01",
    title: "Conecta tu WhatsApp",
    description:
      "Vincula tu numero de WhatsApp Business en minutos. Sin codigo, sin complicaciones tecnicas.",
    icon: "/illustrations/step-01.svg",
  },
  {
    number: "02",
    title: "Tu agente empieza a vender",
    description:
      "VendeTo' responde automaticamente a tus clientes. Recomienda productos, responde preguntas y arma el pedido.",
    icon: "/illustrations/step-02.svg",
  },
  {
    number: "03",
    title: "Cobro automatico con Azul",
    description:
      "Cuando el cliente esta listo, VendeTo' genera un enlace de pago seguro de Azul directo en el chat.",
    icon: "/illustrations/step-03.svg",
  },
  {
    number: "04",
    title: "Venta confirmada",
    description:
      "El pago se verifica al instante. Tu ves todo en tu dashboard. El cliente recibe su confirmacion en WhatsApp.",
    icon: "/illustrations/step-04.svg",
  },
];

export function HowItWorks() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.15 });

  return (
    <section ref={ref} id="como-funciona" className="site-section">
      <div className="site-shell">
        <h2 className="site-section-heading mb-12 text-center text-4xl tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
          De WhatsApp a pago en 4 pasos.
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 dash-border-t dash-border-l">
          {steps.map((step, i) => (
            <motion.div
              key={step.number}
              className="dash-border-r dash-border-b p-8 lg:p-10 space-y-4"
              initial={{ opacity: 0, y: 16 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.4, delay: i * 0.1 }}
            >
              {/* Step icon */}
              {step.icon ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={step.icon} alt="" width={64} height={64} className="mb-2 h-16 w-16" />
              ) : (
                <div className="mb-2 flex h-16 w-16 items-center justify-center border border-dashed border-muted/30">
                  <span className="font-mono text-xs text-muted/40">ICON</span>
                </div>
              )}
              <h3 className="text-lg font-semibold">
                <span className="mr-2 font-mono text-sm font-medium text-muted">{step.number}</span>
                {step.title}
              </h3>
              <p className="text-sm leading-relaxed text-muted">
                {step.description}
              </p>
            </motion.div>
          ))}
        </div>

      </div>
    </section>
  );
}

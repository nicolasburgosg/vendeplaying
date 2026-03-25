"use client";

import { useDialKit } from "dialkit";
import { ArrowCTA } from "@/components/arrow-cta";

export function CtaBand() {
  const spacing = useDialKit("CTA Band", {
    offsetY: [-200, -300, 100],
  });

  return (
    <section style={{ transform: `translateY(${spacing.offsetY}px)` }}>
      <div className="site-shell flex flex-col items-center gap-8 py-16 sm:py-20 text-center">
        <h2 className="site-section-heading text-4xl tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
          Empieza a vender más hoy.
        </h2>
        <p className="max-w-lg text-[1.1rem] leading-relaxed text-muted">
          Conecta tu WhatsApp Business, sube tu catalogo y deja que
          VendeTo&apos; se encargue de vender por ti. Siempre activo. Siempre vendiendo.
        </p>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/illustrations/cta-bot.svg"
          alt=""
          width={440}
          height={440}
          className="w-full max-w-[440px]"
        />

        <ArrowCTA label="Crea tu Agente IA" href="/registro" variant="dark" />
      </div>
    </section>
  );
}

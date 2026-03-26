import Link from "next/link";
import { BrandLockup } from "@/components/brand-lockup";

export function SiteFooter() {
  return (
    <footer>
      <div className="bg-black text-white/80">
        <div className="site-shell grid gap-10 py-16 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand column */}
          <div className="space-y-4">
            <BrandLockup className="[&_p]:text-white" />
            <p className="max-w-sm text-sm leading-relaxed text-white/50">
              Tu agente de ventas por WhatsApp con IA.
            </p>
          </div>

          {/* Producto */}
          <div className="space-y-3">
            <p className="font-mono text-xs font-medium uppercase tracking-[0.2em] text-white/40">
              Producto
            </p>
            <nav className="flex flex-col gap-2 text-sm">
              <Link href="/#como-funciona" className="transition-colors hover:text-white">
                Como Funciona
              </Link>
              <Link href="/precios" className="transition-colors hover:text-white">
                Precios
              </Link>
              <Link href="/app" className="transition-colors hover:text-white">
                Panel
              </Link>
            </nav>
          </div>

          {/* Empresa */}
          <div className="space-y-3">
            <p className="font-mono text-xs font-medium uppercase tracking-[0.2em] text-white/40">
              Empresa
            </p>
            <nav className="flex flex-col gap-2 text-sm">
              <Link href="/demo" className="transition-colors hover:text-white">
                Contacto
              </Link>
              <Link href="/legal" className="transition-colors hover:text-white">
                Terminos y Condiciones
              </Link>
              <Link href="/privacidad" className="transition-colors hover:text-white">
                Politica de Privacidad
              </Link>
            </nav>
          </div>

          {/* Contacto */}
          <div className="space-y-3">
            <p className="font-mono text-xs font-medium uppercase tracking-[0.2em] text-white/40">
              Contacto
            </p>
            <div className="flex flex-col gap-2 text-sm">
              <p>hi@vendeto.co</p>
              <p>Santo Domingo, Republica Dominicana</p>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-white/8">
          <div className="site-shell flex flex-col items-center justify-between gap-3 py-5 text-xs text-white/40 sm:flex-row">
            <p>&copy; {new Date().getFullYear()} VendeTo LLC. Todos los derechos reservados.</p>
            <p>Sitio web oficial de VendeTo LLC.</p>
          </div>
        </div>
      </div>
    </footer>
  );
}

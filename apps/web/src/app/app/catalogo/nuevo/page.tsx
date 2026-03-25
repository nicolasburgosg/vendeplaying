import Link from "next/link";
import { AppPageIntro } from "@/components/app-page-intro";
import { ProductForm } from "@/components/catalog-forms";

export default function NuevoProductoPage() {
  return (
    <>
      <AppPageIntro
        eyebrow="Catálogo"
        title="Agregar nuevo producto"
        description="Crea un producto manualmente y déjalo listo para vender por WhatsApp."
        aside={
          <Link href="/app/catalogo" className="site-button-secondary text-sm">
            Cancelar
          </Link>
        }
      />

      <section className="app-section">
        <div className="app-card">
          <ProductForm />
        </div>
      </section>
    </>
  );
}

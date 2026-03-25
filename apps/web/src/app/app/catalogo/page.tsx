import Link from "next/link";
import { AppPageIntro } from "@/components/app-page-intro";
import { ProductToggle } from "@/components/product-toggle";
import { CatalogImportForm } from "@/components/catalog-forms";
import { formatCount, formatCurrency, formatDateTime } from "@/lib/format";
import { labelImportJobStatus } from "@/lib/labels";
import { getCatalogPageData } from "@/lib/merchant";

export default async function CatalogoPage() {
  const {
    products,
    importJobs,
    productMediaByProduct,
    importErrorsByJob,
  } = await getCatalogPageData();

  const isEmpty = products.length === 0;

  return (
    <>
      <AppPageIntro
        eyebrow="Catálogo"
        title="Productos"
        description={
          isEmpty
            ? "Visualiza, edita y gestiona todos los productos de tu tienda."
            : `${formatCount(products.length)} productos visibles en esta vista.`
        }
      />

      {isEmpty ? (
        /* ── Empty state ── */
        <section className="app-section">
          <div className="flex flex-col items-center gap-6 py-16 text-center">
            <p className="text-sm text-muted">No hay productos disponibles</p>
            <div className="flex w-56 flex-col gap-3">
              <Link href="/app/catalogo/nuevo" className="site-button w-full">
                + Nuevo producto
              </Link>
              <details>
                <summary className="site-button-secondary w-full cursor-pointer">
                  Carga masiva
                </summary>
                <div className="mt-6 text-left">
                  <CatalogImportForm />
                </div>
              </details>
            </div>
          </div>
        </section>
      ) : (
        /* ── Populated state ── */
        <>
          {/* Product grid */}
          <section className="app-section">
            <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {products.map((product) => {
                const media = productMediaByProduct[product.id] ?? [];
                const primaryImage = media.find((m) => m.is_primary) ?? media[0];
                const isActive = product.status === "active";
                const outOfStock = product.stock_quantity === 0;

                return (
                  <Link
                    key={product.id}
                    href={`/app/catalogo/${product.id}`}
                    className="app-card flex flex-col border border-transparent transition-colors hover:border-line"
                  >
                    {/* Thumbnail — dims when inactive */}
                    <div className={`aspect-[4/3] w-full overflow-hidden rounded-lg bg-background ${
                      isActive ? "" : "opacity-40"
                    }`}>
                      {primaryImage?.public_url ? (
                        <img
                          src={primaryImage.public_url}
                          alt={product.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-muted">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                            <circle cx="8.5" cy="8.5" r="1.5" />
                            <polyline points="21 15 16 10 5 21" />
                          </svg>
                        </div>
                      )}
                    </div>

                    {/* Info — dims when inactive */}
                    <div className={`mt-3 flex flex-1 flex-col gap-1.5 overflow-hidden ${
                      isActive ? "" : "opacity-40"
                    }`}>
                      <p className="truncate text-sm font-semibold text-foreground">
                        {product.name}
                      </p>

                      <div className="flex items-center gap-3 text-xs text-muted">
                        <span>{formatCurrency(product.price, product.currency_code)}</span>
                        <span
                          className={`inline-flex items-center gap-1 ${
                            outOfStock ? "text-red-600" : ""
                          }`}
                          title="Inventario"
                        >
                          {/* Box icon */}
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
                            <path d="m3.3 7 8.7 5 8.7-5" />
                            <path d="M12 22V12" />
                          </svg>
                          {product.stock_quantity}
                        </span>
                      </div>
                    </div>

                    {/* Toggle — always full opacity */}
                    <ProductToggle productId={product.id} currentStatus={product.status} />
                  </Link>
                );
              })}
            </div>
          </section>

          {/* Actions */}
          <section className="app-section">
            <div className="flex flex-col items-center gap-3">
              <div className="flex w-56 flex-col gap-3">
                <Link href="/app/catalogo/nuevo" className="site-button w-full">
                  + Nuevo producto
                </Link>
                <details>
                  <summary className="site-button-secondary w-full cursor-pointer">
                    Carga masiva
                  </summary>
                  <div className="mt-6 text-left">
                    <CatalogImportForm />
                  </div>
                </details>
              </div>
            </div>
          </section>
        </>
      )}

      {importJobs.length > 0 && (
        <section className="app-section">
          <div className="app-card">
            <p className="app-label mb-4">Importaciones CSV</p>
            <table className="site-table">
              <thead>
                <tr>
                  <th>Archivo</th>
                  <th>Estado</th>
                  <th>Filas</th>
                  <th>Errores</th>
                  <th>Actualizado</th>
                </tr>
              </thead>
              <tbody>
                {importJobs.map((job) => (
                  <tr key={job.id}>
                    <td className="font-semibold text-foreground">
                      {job.original_filename ?? "Importación manual"}
                    </td>
                    <td className="text-sm text-muted">
                      {labelImportJobStatus(job.status)}
                    </td>
                    <td className="text-sm text-muted">
                      {job.processed_rows}/{job.total_rows}
                    </td>
                    <td className="text-sm text-muted">
                      {job.inserted_count} insertados · {job.updated_count} actualizados
                      <br />
                      {job.error_count} errores / {job.warning_count} warnings
                    </td>
                    <td className="text-sm text-muted">
                      {formatDateTime(job.updated_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {importJobs.flatMap((job) => importErrorsByJob[job.id] ?? []).length > 0 && (
              <div className="mt-6 dash-border-t pt-4">
                <p className="app-label mb-3">Errores recientes</p>
                <ul className="site-list text-sm leading-7 text-muted">
                  {importJobs.flatMap((job) =>
                    (importErrorsByJob[job.id] ?? []).slice(0, 4).map((error) => (
                      <li key={error.id}>
                        <span className="font-semibold text-foreground">
                          Fila {error.row_number}
                        </span>
                        {` · ${error.error_message}`}
                      </li>
                    )),
                  )}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}
    </>
  );
}

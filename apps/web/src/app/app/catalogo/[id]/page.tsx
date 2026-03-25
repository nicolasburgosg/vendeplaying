import Link from "next/link";
import { notFound } from "next/navigation";
import { AppPageIntro } from "@/components/app-page-intro";
import { ProductEditForm, ProductVariantForm, ProductMediaForm } from "@/components/catalog-forms";
import {
  archiveProductAction,
  deleteProductMediaAction,
  updateProductVariantInventoryAction,
} from "@/app/app/actions";
import { PRODUCT_STATUS_OPTIONS } from "@/lib/domain-options";
import { formatCurrency } from "@/lib/format";
import { labelProductStatus } from "@/lib/labels";
import { createClient } from "@/lib/supabase/server";
import { getMerchantContext } from "@/lib/merchant";

export default async function EditarProductoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const context = await getMerchantContext();
  const supabase = await createClient();
  const organizationId = context.organization.id;

  const [productResult, variantsResult, mediaResult] = await Promise.all([
    supabase
      .from("products")
      .select(
        "id, name, price, compare_at_price, currency_code, status, stock_quantity, sku, description, track_inventory, allow_backorder",
      )
      .eq("organization_id", organizationId)
      .eq("id", id)
      .single(),
    supabase
      .from("product_variants")
      .select(
        "id, name, sku, stock_quantity, price_override, status, updated_at",
      )
      .eq("organization_id", organizationId)
      .eq("product_id", id)
      .order("updated_at", { ascending: false })
      .limit(20),
    supabase
      .from("product_media")
      .select("id, media_type, public_url, is_primary, sort_order")
      .eq("organization_id", organizationId)
      .eq("product_id", id)
      .order("sort_order", { ascending: true })
      .limit(20),
  ]);

  const product = productResult.data;
  if (productResult.error || !product) {
    notFound();
  }

  const variants = variantsResult.data ?? [];
  const media = mediaResult.data ?? [];

  return (
    <>
      <AppPageIntro
        eyebrow="Catálogo"
        title={product.name}
        description="Edita la información comercial, las variantes y las imágenes de este producto."
        aside={
          <Link href="/app/catalogo" className="site-button-secondary text-sm">
            Volver al catálogo
          </Link>
        }
      />

      {/* Edit form */}
      <section className="app-section">
        <div className="app-card">
          <ProductEditForm product={product} />
        </div>
      </section>

      {/* Variants */}
      <section className="app-section space-y-4">
        <div className="app-card">
          <p className="app-label mb-4">
            Variantes ({variants.length})
          </p>
          {variants.length > 0 ? (
            <ul className="site-list text-sm text-muted">
              {variants.map((variant) => (
                <li key={variant.id}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <span className="font-semibold text-foreground">
                        {variant.name}
                      </span>
                      {variant.sku ? <span className="ml-2 text-xs">{variant.sku}</span> : null}
                    </div>
                    <form action={updateProductVariantInventoryAction} className="flex items-center gap-2">
                      <input type="hidden" name="variantId" value={variant.id} />
                      <input
                        name="stockQuantity"
                        type="number"
                        min="0"
                        step="1"
                        className="site-input w-20 py-1.5 text-sm"
                        defaultValue={variant.stock_quantity}
                      />
                      <input
                        name="priceOverride"
                        type="number"
                        min="0"
                        step="0.01"
                        className="site-input w-24 py-1.5 text-sm"
                        defaultValue={variant.price_override ?? ""}
                        placeholder={formatCurrency(product.price, product.currency_code)}
                      />
                      <select
                        name="status"
                        className="site-input py-1.5 text-sm"
                        defaultValue={variant.status}
                      >
                        {PRODUCT_STATUS_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {labelProductStatus(option)}
                          </option>
                        ))}
                      </select>
                      <button type="submit" className="site-button-secondary py-1.5 text-xs">
                        Guardar
                      </button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Sin variantes.</p>
          )}
        </div>

        <details className="app-card">
          <summary className="app-label cursor-pointer">
            + Agregar variante
          </summary>
          <div className="mt-4">
            <ProductVariantForm products={[{ id: product.id, name: product.name }]} />
          </div>
        </details>
      </section>

      {/* Media */}
      <section className="app-section space-y-4">
        <div className="app-card">
          <p className="app-label mb-4">
            Imágenes y media ({media.length})
          </p>
          {media.length > 0 ? (
            <div className="flex flex-wrap gap-3">
              {media.map((item) => (
                <div key={item.id} className="group relative">
                  {item.public_url && item.media_type !== "video" ? (
                    <img
                      src={item.public_url}
                      alt={item.is_primary ? "Principal" : "Media"}
                      className="h-20 w-20 rounded-lg border border-line object-cover"
                    />
                  ) : (
                    <div className="flex h-20 w-20 items-center justify-center rounded-lg border border-line bg-background text-xs text-muted">
                      {item.media_type === "video" ? "Video" : "Media"}
                    </div>
                  )}
                  {item.is_primary && (
                    <span className="absolute -top-1.5 -left-1.5 rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-medium text-white">
                      Principal
                    </span>
                  )}
                  <form action={deleteProductMediaAction} className="absolute -top-2 -right-2">
                    <input type="hidden" name="mediaId" value={item.id} />
                    <button
                      type="submit"
                      className="flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-xs text-background"
                    >
                      x
                    </button>
                  </form>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">Sin imágenes.</p>
          )}
        </div>

        <details className="app-card">
          <summary className="app-label cursor-pointer">
            + Agregar media
          </summary>
          <div className="mt-4">
            <ProductMediaForm products={[{ id: product.id, name: product.name }]} />
          </div>
        </details>
      </section>

      {/* Archive */}
      <section className="app-section">
        <form action={archiveProductAction} className="flex justify-center">
          <input type="hidden" name="productId" value={product.id} />
          <button type="submit" className="text-sm text-muted hover:text-red-600">
            Archivar producto
          </button>
        </form>
      </section>
    </>
  );
}

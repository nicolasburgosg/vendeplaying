"use client";

import { useActionState, useCallback, useRef, useState } from "react";
import {
  saveKnowledgeItemAction,
  saveCatalogImportAction,
  saveProductMediaAction,
  saveProductAction,
  saveProductVariantAction,
  updateProductAction,
} from "@/app/app/actions";
import { FormStateMessage } from "@/components/form-state-message";
import { FormSubmitButton } from "@/components/form-submit-button";
import {
  KNOWLEDGE_CATEGORY_OPTIONS,
  KNOWLEDGE_KIND_OPTIONS,
  PRODUCT_STATUS_OPTIONS,
} from "@/lib/domain-options";
import { INITIAL_APP_FORM_STATE } from "@/lib/form-state";
import {
  labelKnowledgeCategory,
  labelKnowledgeKind,
  labelProductStatus,
} from "@/lib/labels";

type ProductOption = {
  id: string;
  name: string;
};

function formatDOP(value: string): string {
  const num = parseFloat(value);
  if (isNaN(num)) return "";
  return num.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function PriceInput() {
  const [raw, setRaw] = useState("");
  const [display, setDisplay] = useState("");
  const [focused, setFocused] = useState(false);

  return (
    <>
      <input type="hidden" name="price" value={raw} />
      <input
        type="text"
        inputMode="decimal"
        className="site-input"
        placeholder="0.00"
        required
        value={focused ? raw : display}
        onChange={(e) => {
          const v = e.target.value.replace(/[^0-9.]/g, "");
          setRaw(v);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          setDisplay(raw ? formatDOP(raw) : "");
        }}
      />
    </>
  );
}

const ACCEPTED_TYPES = ["image/jpeg", "image/jpg", "image/png", "video/mp4", "video/3gpp"];
const MAX_IMG_SIZE = 3 * 1024 * 1024;
const MAX_VIDEO_SIZE = 16 * 1024 * 1024;
const MAX_FILES = 3;

function ImageDropZone() {
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const syncInput = useCallback((allFiles: File[]) => {
    if (!inputRef.current) return;
    const dt = new DataTransfer();
    allFiles.forEach((f) => dt.items.add(f));
    inputRef.current.files = dt.files;
  }, []);

  const addFiles = useCallback((incoming: FileList | File[]) => {
    const newFiles: File[] = [];
    const newPreviews: string[] = [];

    for (const file of Array.from(incoming)) {
      if (files.length + newFiles.length >= MAX_FILES) break;
      if (!ACCEPTED_TYPES.includes(file.type)) continue;

      const limit = file.type.startsWith("video/") ? MAX_VIDEO_SIZE : MAX_IMG_SIZE;
      if (file.size > limit) continue;

      newFiles.push(file);
      if (file.type.startsWith("image/")) {
        newPreviews.push(URL.createObjectURL(file));
      } else {
        newPreviews.push("");
      }
    }

    const updated = [...files, ...newFiles];
    setFiles(updated);
    setPreviews((prev) => [...prev, ...newPreviews]);
    syncInput(updated);
  }, [files, syncInput]);

  const removeFile = (index: number) => {
    if (previews[index]) URL.revokeObjectURL(previews[index]);
    const updated = files.filter((_, i) => i !== index);
    setFiles(updated);
    setPreviews((prev) => prev.filter((_, i) => i !== index));
    syncInput(updated);
  };

  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  const imgCount = files.filter((f) => f.type.startsWith("image/")).length;
  const vidCount = files.filter((f) => f.type.startsWith("video/")).length;

  return (
    <div className="space-y-3">
      {/* File input for form submission — synced via DataTransfer */}
      <input
        ref={inputRef}
        type="file"
        name="images"
        multiple
        accept=".jpg,.jpeg,.png,.mp4,.3gpp"
        className="hidden"
        onChange={(e) => {
          if (e.target.files) addFiles(e.target.files);
        }}
      />

      {/* Drop zone */}
      <div
        role="button"
        tabIndex={0}
        className={`flex flex-col items-center gap-3 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors ${
          dragging
            ? "border-accent bg-accent-soft"
            : "border-line hover:border-muted"
        }`}
        onClick={() => {
          if (inputRef.current) inputRef.current.value = "";
          inputRef.current?.click();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
        }}
      >
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        <p className="text-sm text-muted">
          Arrastra y suelta los archivos o haz clic para enviar
        </p>
        <p className="text-xs text-muted">
          Máximo {MAX_FILES} archivos (fotos o videos). Pesos: 3MB imgs / 16MB videos (JPEG, JPG, PNG, 3GPP, MP4)
        </p>
      </div>

      {/* Previews */}
      {files.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {files.map((file, i) => (
            <div key={`${file.name}-${i}`} className="group relative">
              {previews[i] ? (
                <img
                  src={previews[i]}
                  alt={file.name}
                  className="h-20 w-20 rounded-lg border border-line object-cover"
                />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-lg border border-line bg-background text-xs text-muted">
                  Video
                </div>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeFile(i);
                }}
                className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-xs text-background"
              >
                x
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Stats */}
      <p className="text-xs text-muted">
        {imgCount} img{imgCount !== 1 ? "s" : ""} · {vidCount} video{vidCount !== 1 ? "s" : ""} ({(totalSize / (1024 * 1024)).toFixed(1)}MB)
      </p>
    </div>
  );
}

export function ProductForm() {
  const [state, formAction] = useActionState(
    saveProductAction,
    INITIAL_APP_FORM_STATE,
  );

  return (
    <form action={formAction} className="space-y-10">
      <input type="hidden" name="currencyCode" value="DOP" />

      {/* ── Información básica ── */}
      <fieldset className="space-y-5">
        <div>
          <legend className="text-base font-semibold">Información básica</legend>
          <p className="mt-1 text-sm text-muted">
            Agrega la información principal de tu producto.
          </p>
        </div>

        <label className="grid gap-2 text-sm font-medium">
          Nombre del producto
          <input
            name="name"
            className="site-input"
            placeholder="Ej: Camiseta de algodón"
            required
          />
        </label>

        <label className="grid gap-2 text-sm font-medium">
          Descripción
          <textarea
            name="description"
            className="site-textarea"
            placeholder="Describe tu producto para que los clientes sepan qué están comprando."
          />
          <span className="text-xs text-muted">
            Esta descripción la usará tu vendedor IA para responder preguntas.
          </span>
        </label>
      </fieldset>

      {/* ── Precio e inventario ── */}
      <fieldset className="space-y-5">
        <div>
          <legend className="text-base font-semibold">Precio e inventario</legend>
          <p className="mt-1 text-sm text-muted">
            Define cuánto cuesta y cuántas unidades tienes disponibles.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2 text-sm font-medium">
            Precio (🇩🇴 DOP)
            <PriceInput />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            Inventario
            <input
              name="stockQuantity"
              type="number"
              min="0"
              step="1"
              className="site-input"
              placeholder="0"
              defaultValue="0"
            />
          </label>
        </div>
      </fieldset>

      {/* ── Imágenes y videos ── */}
      <fieldset className="space-y-5">
        <div>
          <legend className="text-base font-semibold">Imágenes y videos</legend>
          <p className="mt-1 text-sm text-muted">
            Agrega imágenes y videos de tu producto.
          </p>
        </div>
        <ImageDropZone />
      </fieldset>

      {/* ── Opciones avanzadas ── */}
      <details className="text-sm">
        <summary className="cursor-pointer font-medium text-muted hover:text-foreground">
          Opciones avanzadas
        </summary>
        <div className="mt-5 space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 font-medium">
              SKU
              <input name="sku" className="site-input" placeholder="Código interno" />
            </label>
            <label className="grid gap-2 font-medium">
              Precio tachado
              <input
                name="compareAtPrice"
                type="number"
                min="0"
                step="0.01"
                className="site-input"
                placeholder="0.00"
              />
            </label>
          </div>
          <label className="grid gap-2 font-medium">
            Estado
            <select name="status" className="site-input" defaultValue="draft">
              {PRODUCT_STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {labelProductStatus(option)}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-6">
            <label className="inline-flex items-center gap-3">
              <input type="checkbox" name="trackInventory" defaultChecked />
              Controlar inventario
            </label>
            <label className="inline-flex items-center gap-3">
              <input type="checkbox" name="allowBackorder" />
              Permitir backorder
            </label>
          </div>
        </div>
      </details>

      <FormStateMessage state={state} />
      <FormSubmitButton pendingLabel="Creando producto...">
        Crear producto
      </FormSubmitButton>
    </form>
  );
}

type ProductData = {
  id: string;
  name: string;
  price: number;
  compare_at_price: number | null;
  stock_quantity: number;
  sku: string | null;
  status: string;
  description: string | null;
  track_inventory: boolean;
  allow_backorder: boolean;
};

export function ProductEditForm({ product }: { product: ProductData }) {
  const [state, formAction] = useActionState(
    updateProductAction,
    INITIAL_APP_FORM_STATE,
  );

  return (
    <form action={formAction} className="space-y-10">
      <input type="hidden" name="productId" value={product.id} />

      {/* ── Información básica ── */}
      <fieldset className="space-y-5">
        <div>
          <legend className="text-base font-semibold">Información básica</legend>
          <p className="mt-1 text-sm text-muted">
            Agrega la información principal de tu producto.
          </p>
        </div>

        <label className="grid gap-2 text-sm font-medium">
          Nombre del producto
          <input
            name="name"
            className="site-input"
            placeholder="Ej: Camiseta de algodón"
            defaultValue={product.name}
            required
          />
        </label>

        <label className="grid gap-2 text-sm font-medium">
          Descripción
          <textarea
            name="description"
            className="site-textarea"
            placeholder="Describe tu producto para que los clientes sepan qué están comprando."
            defaultValue={product.description ?? ""}
          />
          <span className="text-xs text-muted">
            Esta descripción la usará tu vendedor IA para responder preguntas.
          </span>
        </label>
      </fieldset>

      {/* ── Precio e inventario ── */}
      <fieldset className="space-y-5">
        <div>
          <legend className="text-base font-semibold">Precio e inventario</legend>
          <p className="mt-1 text-sm text-muted">
            Define cuánto cuesta y cuántas unidades tienes disponibles.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2 text-sm font-medium">
            Precio (🇩🇴 DOP)
            <input
              name="price"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              className="site-input"
              placeholder="0.00"
              defaultValue={product.price}
              required
            />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            Inventario
            <input
              name="stockQuantity"
              type="number"
              min="0"
              step="1"
              className="site-input"
              placeholder="0"
              defaultValue={product.stock_quantity}
            />
          </label>
        </div>
      </fieldset>

      {/* ── Opciones avanzadas ── */}
      <details className="text-sm">
        <summary className="cursor-pointer font-medium text-muted hover:text-foreground">
          Opciones avanzadas
        </summary>
        <div className="mt-5 space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 font-medium">
              SKU
              <input
                name="sku"
                className="site-input"
                placeholder="Código interno"
                defaultValue={product.sku ?? ""}
              />
            </label>
            <label className="grid gap-2 font-medium">
              Precio tachado
              <input
                name="compareAtPrice"
                type="number"
                min="0"
                step="0.01"
                className="site-input"
                placeholder="0.00"
                defaultValue={product.compare_at_price ?? ""}
              />
            </label>
          </div>
          <label className="grid gap-2 font-medium">
            Estado
            <select name="status" className="site-input" defaultValue={product.status}>
              {PRODUCT_STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {labelProductStatus(option)}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-6">
            <label className="inline-flex items-center gap-3">
              <input
                type="checkbox"
                name="trackInventory"
                defaultChecked={product.track_inventory}
              />
              Controlar inventario
            </label>
            <label className="inline-flex items-center gap-3">
              <input
                type="checkbox"
                name="allowBackorder"
                defaultChecked={product.allow_backorder}
              />
              Permitir backorder
            </label>
          </div>
        </div>
      </details>

      <FormStateMessage state={state} />
      <FormSubmitButton pendingLabel="Guardando cambios...">
        Guardar cambios
      </FormSubmitButton>
    </form>
  );
}

export function KnowledgeItemForm({ products }: { products: ProductOption[] }) {
  const [state, formAction] = useActionState(
    saveKnowledgeItemAction,
    INITIAL_APP_FORM_STATE,
  );

  return (
    <form action={formAction} className="space-y-6 border-t border-line pt-6">
      <div className="grid gap-4 lg:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium">
          Título
          <input name="title" className="site-input" />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Pregunta
          <input name="question" className="site-input" />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Tipo
          <select name="kind" className="site-input" defaultValue="faq">
            {KNOWLEDGE_KIND_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {labelKnowledgeKind(option)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Categoría
          <select name="category" className="site-input" defaultValue="general">
            {KNOWLEDGE_CATEGORY_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {labelKnowledgeCategory(option)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Producto vinculado
          <select name="productId" className="site-input" defaultValue="">
            <option value="">Sin producto</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <input type="hidden" name="priority" value="100" />

      <label className="inline-flex items-center gap-3 text-sm">
        <input type="checkbox" name="isActive" defaultChecked />
        Respuesta activa
      </label>

      <label className="grid gap-2 text-sm font-medium">
        Respuesta
        <textarea name="answer" className="site-textarea" required />
      </label>

      <FormStateMessage state={state} />
      <FormSubmitButton pendingLabel="Guardando knowledge item...">
        Guardar respuesta
      </FormSubmitButton>
    </form>
  );
}

export function ProductVariantForm({ products }: { products: ProductOption[] }) {
  const [state, formAction] = useActionState(
    saveProductVariantAction,
    INITIAL_APP_FORM_STATE,
  );

  return (
    <form action={formAction} className="space-y-6 border-t border-line pt-6">
      <div className="grid gap-4 lg:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium">
          Producto base
          <select name="productId" className="site-input" defaultValue="" required>
            <option value="" disabled>
              Selecciona un producto
            </option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Nombre de la variante
          <input name="name" className="site-input" placeholder="Paquete de 1 libra" required />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          SKU variante
          <input name="sku" className="site-input" />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Inventario
          <input
            name="stockQuantity"
            type="number"
            min="0"
            step="1"
            className="site-input"
            defaultValue="0"
          />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Override de precio
          <input
            name="priceOverride"
            type="number"
            min="0"
            step="0.01"
            className="site-input"
          />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Estado
          <select name="status" className="site-input" defaultValue="active">
            {PRODUCT_STATUS_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {labelProductStatus(option)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="grid gap-2 text-sm font-medium">
        Opciones
        <input
          name="optionValues"
          className="site-input"
          placeholder="tamano: 1 lb, molienda: espresso"
        />
      </label>

      <FormStateMessage state={state} />
      <FormSubmitButton pendingLabel="Guardando variante...">
        Guardar variante
      </FormSubmitButton>
    </form>
  );
}

export function ProductMediaForm({ products }: { products: ProductOption[] }) {
  const [state, formAction] = useActionState(
    saveProductMediaAction,
    INITIAL_APP_FORM_STATE,
  );

  return (
    <form action={formAction} className="space-y-6 border-t border-line pt-6">
      <div className="grid gap-4 lg:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium">
          Producto
          <select name="productId" className="site-input" defaultValue="" required>
            <option value="" disabled>
              Selecciona un producto
            </option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Tipo
          <input
            name="mediaType"
            className="site-input"
            defaultValue="image"
            placeholder="image"
          />
        </label>
        <label className="grid gap-2 text-sm font-medium lg:col-span-2">
          URL pública
          <input
            name="publicUrl"
            className="site-input"
            placeholder="https://..."
            required
          />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Orden
          <input
            name="sortOrder"
            type="number"
            min="0"
            step="1"
            className="site-input"
            defaultValue="0"
          />
        </label>
        <label className="inline-flex items-center gap-3 text-sm">
          <input type="checkbox" name="isPrimary" />
          Marcar como imagen principal
        </label>
      </div>

      <FormStateMessage state={state} />
      <FormSubmitButton pendingLabel="Guardando medio...">
        Guardar medio
      </FormSubmitButton>
    </form>
  );
}

export function CatalogImportForm() {
  const [state, formAction] = useActionState(
    saveCatalogImportAction,
    INITIAL_APP_FORM_STATE,
  );

  return (
    <form action={formAction} className="space-y-6 border-t border-line pt-6">
      <div className="grid gap-4">
        <label className="grid gap-2 text-sm font-medium">
          Archivo CSV
          <input
            type="file"
            name="file"
            accept=".csv,text/csv"
            className="site-input"
            required
          />
        </label>
        <p className="text-sm leading-7 text-muted">
          VendeTo procesa el archivo en segundo plano. El worker valida filas,
          registra errores por línea y actualiza el catálogo cuando termina.
        </p>
      </div>

      <FormStateMessage state={state} />
      <FormSubmitButton pendingLabel="Encolando importación...">
        Procesar CSV
      </FormSubmitButton>
    </form>
  );
}

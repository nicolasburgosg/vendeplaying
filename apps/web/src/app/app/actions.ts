"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getActionContext, getPrimaryChannelId } from "@/lib/action-context";
import type { AppFormState } from "@/lib/form-state";
import {
  normalizeBoolean,
  normalizeEmail,
  normalizeOptionalText,
  normalizeStringList,
  normalizeText,
  parseDecimal,
  parseInteger,
} from "@/lib/form-state";
import { getReadinessReport } from "@/lib/readiness";
import {
  cancelConversationFollowUps,
  cancelOrderRelatedJobs,
  enqueueScheduledJob,
  scheduleConversationSummary,
  scheduleFollowUpsForConversation,
} from "@/lib/server/jobs";
import {
  getCatalogImportSummaryJson,
  parseCatalogCsvPreview,
  queueCatalogImport,
} from "@/lib/server/imports";
import { createKapsoSetupLink, ensureKapsoCustomer } from "@/lib/kapso";
import type { Database, Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

type LeadTemperature = Database["public"]["Enums"]["lead_temperature"];
type ChannelStatus = Database["public"]["Enums"]["channel_status"];
type ChannelProvider = Database["public"]["Enums"]["channel_provider"];
type ChannelRow = Database["public"]["Tables"]["whatsapp_channels"]["Row"];
type ChannelInsert = Database["public"]["Tables"]["whatsapp_channels"]["Insert"];
type ChannelUpdate = Database["public"]["Tables"]["whatsapp_channels"]["Update"];

type KapsoChannelMetadata = {
  kapso_customer_id?: string | null;
  kapso_customer_external_id?: string | null;
  kapso_setup_link_id?: string | null;
  kapso_setup_link_url?: string | null;
  kapso_setup_link_status?: string | null;
  kapso_setup_link_expires_at?: string | null;
  kapso_setup_status?: string | null;
  kapso_setup_error?: string | null;
  kapso_project_webhook_id?: string | null;
  kapso_meta_webhook_id?: string | null;
  kapso_webhooks_registered_at?: string | null;
  kapso_webhooks_skipped?: boolean | null;
  [key: string]: Json | undefined;
};

function successState(message: string): AppFormState {
  return {
    status: "success",
    message,
  };
}

function errorState(error: unknown): AppFormState {
  const message =
    error instanceof Error ? error.message : "No se pudo completar la acción.";

  return {
    status: "error",
    message,
  };
}

function revalidateMerchantPaths(paths: string[]) {
  const uniquePaths = new Set<string>(["/app", ...paths]);

  uniquePaths.forEach((path) => {
    revalidatePath(path);
  });
}

function asJsonRecord(value: Json | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, Json>)
    : {};
}

function toKapsoMetadata(value: Json | null | undefined) {
  return asJsonRecord(value) as KapsoChannelMetadata;
}

async function getPrimaryChannel(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
) {
  const { data, error } = await supabase
    .from("whatsapp_channels")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as ChannelRow | null;
}

async function upsertPrimaryWhatsAppChannel(params: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  organizationId: string;
  phone: string;
  displayName: string | null;
}) {
  const existing = await getPrimaryChannel(params.supabase, params.organizationId);
  const status = ((existing?.status ?? "pending_verification") as ChannelStatus);
  const metadata = existing ? toKapsoMetadata(existing.metadata) : {};
  const payload = {
    phone_e164: params.phone,
    display_name: params.displayName,
    provider: "kapso_platform" as ChannelProvider,
    status,
    provider_business_account_id: existing?.provider_business_account_id ?? null,
    provider_phone_number_id: existing?.provider_phone_number_id ?? null,
    quality_rating: existing?.quality_rating ?? "unknown",
    connected_at: status === "connected" ? new Date().toISOString() : null,
    metadata: metadata as unknown as Json,
  };

  if (existing) {
    const updatePayload: ChannelUpdate = {
      ...payload,
      organization_id: params.organizationId,
    };
    const { error } = await params.supabase
      .from("whatsapp_channels")
      .update(updatePayload)
      .eq("organization_id", params.organizationId)
      .eq("id", existing.id);

    if (error) {
      throw new Error(error.message);
    }

    return {
      ...existing,
      ...updatePayload,
      id: existing.id,
    } as ChannelRow;
  }

  const insertPayload: ChannelInsert = {
    ...payload,
    organization_id: params.organizationId,
  };

  const { data, error } = await params.supabase
    .from("whatsapp_channels")
    .insert(insertPayload)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "No pudimos crear el canal.");
  }

  return data as ChannelRow;
}

function optionPairsToJson(value: FormDataEntryValue | null) {
  const pairs = normalizeStringList(value);

  return pairs.reduce<Record<string, string>>((acc, pair, index) => {
    const [rawKey, ...rawValueParts] = pair.split(":");
    const key = rawKey?.trim();
    const parsedValue = rawValueParts.join(":").trim();

    if (key && parsedValue) {
      acc[key] = parsedValue;
    } else if (pair.trim()) {
      acc[`opcion_${index + 1}`] = pair.trim();
    }

    return acc;
  }, {}) as Json;
}

async function refreshOrderTotals(
  organizationId: string,
  orderId: string,
) {
  const supabase = await createClient();
  const [orderResult, itemsResult] = await Promise.all([
    supabase
      .from("orders")
      .select("shipping_fee, discount_total")
      .eq("organization_id", organizationId)
      .eq("id", orderId)
      .single(),
    supabase
      .from("order_items")
      .select("quantity, unit_price, line_total")
      .eq("organization_id", organizationId)
      .eq("order_id", orderId),
  ]);

  if (orderResult.error) {
    throw new Error(orderResult.error.message);
  }

  if (itemsResult.error) {
    throw new Error(itemsResult.error.message);
  }

  const subtotal = (itemsResult.data ?? []).reduce((sum, item) => {
    return sum + Number(item.line_total ?? item.quantity * item.unit_price);
  }, 0);

  const totalAmount = Math.max(
    subtotal + Number(orderResult.data.shipping_fee ?? 0) - Number(orderResult.data.discount_total ?? 0),
    0,
  );

  const { error } = await supabase
    .from("orders")
    .update({
      subtotal,
      total_amount: totalAmount,
    })
    .eq("organization_id", organizationId)
    .eq("id", orderId);

  if (error) {
    throw new Error(error.message);
  }
}

async function getPaymentConfigsForOrganization(organizationId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organization_payment_configs")
    .select("*")
    .eq("organization_id", organizationId);

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();

  redirect("/login");
}

export async function toggleSellerActiveAction(formData: FormData) {
  const { supabase, organizationId } = await getActionContext();
  const currentlyActive = normalizeText(formData.get("currentlyActive")) === "true";

  const { error } = await supabase
    .from("ai_seller_profiles")
    .update({
      is_active: !currentlyActive,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", organizationId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateMerchantPaths(["/app/ia-vendedora", "/app"]);
}

export async function saveSellerProfileAction(
  _previousState: AppFormState,
  formData: FormData,
) {
  try {
    const { supabase, organizationId } = await getActionContext();
    const sellerName = normalizeText(formData.get("sellerName"));

    if (!sellerName) {
      throw new Error("El nombre del vendedor es obligatorio.");
    }

    const channelId = await getPrimaryChannelId(supabase, organizationId);
    const payload = {
      organization_id: organizationId,
      channel_id: channelId,
      seller_name: sellerName,
      tone: normalizeOptionalText(formData.get("tone")),
      sales_style: normalizeText(formData.get("salesStyle")) || "balanced",
      message_length: normalizeText(formData.get("messageLength")) || "medium",
      language_code: normalizeText(formData.get("languageCode")) || "es-DO",
      is_active: normalizeBoolean(formData.get("isActive")),
      use_emojis: normalizeBoolean(formData.get("useEmojis")),
      company_description: normalizeOptionalText(formData.get("companyDescription")),
      target_audience: normalizeOptionalText(formData.get("targetAudience")),
      special_instructions: normalizeOptionalText(formData.get("specialInstructions")),
      welcome_message: normalizeOptionalText(formData.get("welcomeMessage")),
      human_handoff_message: normalizeOptionalText(formData.get("humanHandoffMessage")),
      purchase_confirmation_message: normalizeOptionalText(
        formData.get("purchaseConfirmationMessage"),
      ),
      forbidden_words: normalizeStringList(formData.get("forbiddenWords")),
    };

    const { data: existing, error: existingError } = await supabase
      .from("ai_seller_profiles")
      .select("id")
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (existingError) {
      throw new Error(existingError.message);
    }

    if (existing) {
      const { error } = await supabase
        .from("ai_seller_profiles")
        .update(payload)
        .eq("organization_id", organizationId);

      if (error) {
        throw new Error(error.message);
      }
    } else {
      const { error } = await supabase.from("ai_seller_profiles").insert(payload);

      if (error) {
        throw new Error(error.message);
      }
    }

    revalidateMerchantPaths(["/app/ia-vendedora", "/app/configuracion"]);
    return successState("Perfil de IA actualizado.");
  } catch (error) {
    return errorState(error);
  }
}

export async function saveTemplateAction(
  _previousState: AppFormState,
  formData: FormData,
) {
  try {
    const { supabase, user, organizationId } = await getActionContext();
    const name = normalizeText(formData.get("name"));

    if (!name) {
      throw new Error("El nombre de la plantilla es obligatorio.");
    }

    const channelId = await getPrimaryChannelId(supabase, organizationId);
    const payload = {
      organization_id: organizationId,
      channel_id: channelId,
      name,
      language_code: normalizeText(formData.get("languageCode")) || "es_DO",
      category_code: normalizeText(formData.get("categoryCode")) || "utility",
      status_code: normalizeText(formData.get("statusCode")) || "approved",
      quality_rating_code: null,
      provider_template_id: null,
      components: {
        body: normalizeOptionalText(formData.get("bodyText")),
      } as Json,
      variables_schema: {
        variables: normalizeStringList(formData.get("variablesList")),
      } as Json,
      created_by_user_id: user.id,
      last_synced_at: new Date().toISOString(),
    };

    const { data: existing, error: existingError } = await supabase
      .from("whatsapp_templates")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("name", name)
      .maybeSingle();

    if (existingError) {
      throw new Error(existingError.message);
    }

    if (existing) {
      const { error } = await supabase
        .from("whatsapp_templates")
        .update(payload)
        .eq("organization_id", organizationId)
        .eq("id", existing.id);

      if (error) {
        throw new Error(error.message);
      }
    } else {
      const { error } = await supabase.from("whatsapp_templates").insert(payload);

      if (error) {
        throw new Error(error.message);
      }
    }

    revalidateMerchantPaths(["/app/ia-vendedora", "/app/automatizaciones", "/app/configuracion"]);
    return successState("Plantilla guardada.");
  } catch (error) {
    return errorState(error);
  }
}

export async function saveProductAction(
  _previousState: AppFormState,
  formData: FormData,
) {
  try {
    const { supabase, organizationId } = await getActionContext();
    const name = normalizeText(formData.get("name"));
    const price = parseDecimal(formData.get("price"));

    if (!name) {
      throw new Error("El nombre del producto es obligatorio.");
    }

    if (price <= 0) {
      throw new Error("El precio debe ser mayor que cero.");
    }

    const payload = {
      organization_id: organizationId,
      name,
      description: normalizeOptionalText(formData.get("description")),
      sku: normalizeOptionalText(formData.get("sku")),
      price,
      compare_at_price: parseDecimal(formData.get("compareAtPrice")) || null,
      stock_quantity: parseInteger(formData.get("stockQuantity")),
      status: normalizeText(formData.get("status")) || "draft",
      source_type: "manual",
      currency_code: normalizeText(formData.get("currencyCode")) || "DOP",
      track_inventory: normalizeBoolean(formData.get("trackInventory")),
      allow_backorder: normalizeBoolean(formData.get("allowBackorder")),
      metadata: {},
    };

    const { data: product, error } = await supabase
      .from("products")
      .insert(payload)
      .select("id")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    // Upload images if provided
    const imageFiles = formData.getAll("images").filter(
      (entry): entry is File => entry instanceof File && entry.size > 0,
    );

    for (let i = 0; i < imageFiles.length; i++) {
      const file = imageFiles[i];
      const ext = file.name.split(".").pop() ?? "jpg";
      const storagePath = `${organizationId}/${product.id}/${Date.now()}-${i}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("product-media")
        .upload(storagePath, file, { contentType: file.type, upsert: false });

      if (uploadError) continue;

      const { data: urlData } = supabase.storage
        .from("product-media")
        .getPublicUrl(storagePath);

      await supabase.from("product_media").insert({
        organization_id: organizationId,
        product_id: product.id,
        media_type: file.type.startsWith("video/") ? "video" : "image",
        storage_path: storagePath,
        public_url: urlData.publicUrl,
        is_primary: i === 0,
        sort_order: i,
      });
    }

    revalidateMerchantPaths(["/app/catalogo", "/app"]);
    return successState("Producto creado.");
  } catch (error) {
    return errorState(error);
  }
}

export async function updateProductAction(
  _previousState: AppFormState,
  formData: FormData,
) {
  try {
    const { supabase, organizationId } = await getActionContext();
    const productId = normalizeText(formData.get("productId"));
    const name = normalizeText(formData.get("name"));
    const price = parseDecimal(formData.get("price"));

    if (!productId) {
      throw new Error("Falta el producto a actualizar.");
    }

    if (!name) {
      throw new Error("El nombre del producto es obligatorio.");
    }

    if (price <= 0) {
      throw new Error("El precio debe ser mayor que cero.");
    }

    const { error } = await supabase
      .from("products")
      .update({
        name,
        description: normalizeOptionalText(formData.get("description")),
        sku: normalizeOptionalText(formData.get("sku")),
        price,
        compare_at_price: parseDecimal(formData.get("compareAtPrice")) || null,
        stock_quantity: parseInteger(formData.get("stockQuantity")),
        status: normalizeText(formData.get("status")) || "draft",
        track_inventory: normalizeBoolean(formData.get("trackInventory")),
        allow_backorder: normalizeBoolean(formData.get("allowBackorder")),
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", organizationId)
      .eq("id", productId);

    if (error) {
      throw new Error(error.message);
    }

    revalidateMerchantPaths(["/app/catalogo", "/app"]);
    return successState("Producto actualizado.");
  } catch (error) {
    return errorState(error);
  }
}

export async function updateProductInventoryAction(formData: FormData) {
  const { supabase, organizationId } = await getActionContext();
  const productId = normalizeText(formData.get("productId"));

  if (!productId) {
    throw new Error("Falta el producto a actualizar.");
  }

  const { error } = await supabase
    .from("products")
    .update({
      price: parseDecimal(formData.get("price")),
      stock_quantity: parseInteger(formData.get("stockQuantity")),
      status: normalizeText(formData.get("status")) || "draft",
      compare_at_price: parseDecimal(formData.get("compareAtPrice")) || null,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", organizationId)
    .eq("id", productId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateMerchantPaths(["/app/catalogo", "/app"]);
}

export async function archiveProductAction(formData: FormData) {
  const { supabase, organizationId } = await getActionContext();
  const productId = normalizeText(formData.get("productId"));

  if (!productId) {
    throw new Error("Falta el producto a quitar del catálogo.");
  }

  const updatedAt = new Date().toISOString();

  const { error: productError } = await supabase
    .from("products")
    .update({
      status: "archived",
      updated_at: updatedAt,
    })
    .eq("organization_id", organizationId)
    .eq("id", productId);

  if (productError) {
    throw new Error(productError.message);
  }

  const { error: variantError } = await supabase
    .from("product_variants")
    .update({
      status: "archived",
      updated_at: updatedAt,
    })
    .eq("organization_id", organizationId)
    .eq("product_id", productId);

  if (variantError) {
    throw new Error(variantError.message);
  }

  revalidateMerchantPaths(["/app/catalogo", "/app", "/app/pedidos"]);
}

export async function toggleProductStatusAction(formData: FormData) {
  const { supabase, organizationId } = await getActionContext();
  const productId = normalizeText(formData.get("productId"));
  const currentStatus = normalizeText(formData.get("currentStatus"));

  if (!productId) {
    throw new Error("Falta el producto a actualizar.");
  }

  const newStatus = currentStatus === "active" ? "draft" : "active";

  const { error } = await supabase
    .from("products")
    .update({
      status: newStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", organizationId)
    .eq("id", productId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateMerchantPaths(["/app/catalogo", "/app"]);
}

export async function saveProductVariantAction(
  _previousState: AppFormState,
  formData: FormData,
) {
  try {
    const { supabase, organizationId } = await getActionContext();
    const productId = normalizeText(formData.get("productId"));
    const name = normalizeText(formData.get("name"));

    if (!productId || !name) {
      throw new Error("Selecciona un producto y define el nombre de la variante.");
    }

    const payload = {
      organization_id: organizationId,
      product_id: productId,
      name,
      sku: normalizeOptionalText(formData.get("sku")),
      stock_quantity: parseInteger(formData.get("stockQuantity")),
      price_override: parseDecimal(formData.get("priceOverride")) || null,
      status: normalizeText(formData.get("status")) || "active",
      option_values: optionPairsToJson(formData.get("optionValues")),
    };

    const { error } = await supabase.from("product_variants").insert(payload);

    if (error) {
      throw new Error(error.message);
    }

    revalidateMerchantPaths(["/app/catalogo"]);
    return successState("Variante guardada.");
  } catch (error) {
    return errorState(error);
  }
}

export async function updateProductVariantInventoryAction(formData: FormData) {
  const { supabase, organizationId } = await getActionContext();
  const variantId = normalizeText(formData.get("variantId"));

  if (!variantId) {
    throw new Error("Falta la variante a actualizar.");
  }

  const { error } = await supabase
    .from("product_variants")
    .update({
      stock_quantity: parseInteger(formData.get("stockQuantity")),
      price_override: parseDecimal(formData.get("priceOverride")) || null,
      status: normalizeText(formData.get("status")) || "active",
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", organizationId)
    .eq("id", variantId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateMerchantPaths(["/app/catalogo"]);
}

export async function saveProductMediaAction(
  _previousState: AppFormState,
  formData: FormData,
) {
  try {
    const { supabase, organizationId } = await getActionContext();
    const productId = normalizeText(formData.get("productId"));
    const publicUrl = normalizeOptionalText(formData.get("publicUrl"));

    if (!productId || !publicUrl) {
      throw new Error("Selecciona un producto y define una URL pública.");
    }

    const isPrimary = normalizeBoolean(formData.get("isPrimary"));

    if (isPrimary) {
      const { error: resetError } = await supabase
        .from("product_media")
        .update({ is_primary: false })
        .eq("organization_id", organizationId)
        .eq("product_id", productId);

      if (resetError) {
        throw new Error(resetError.message);
      }
    }

    const { error } = await supabase.from("product_media").insert({
      organization_id: organizationId,
      product_id: productId,
      media_type: normalizeText(formData.get("mediaType")) || "image",
      public_url: publicUrl,
      storage_path: null,
      is_primary: isPrimary,
      sort_order: parseInteger(formData.get("sortOrder")),
    });

    if (error) {
      throw new Error(error.message);
    }

    revalidateMerchantPaths(["/app/catalogo"]);
    return successState("Medio del producto guardado.");
  } catch (error) {
    return errorState(error);
  }
}

export async function deleteProductMediaAction(formData: FormData) {
  const { supabase, organizationId } = await getActionContext();
  const mediaId = normalizeText(formData.get("mediaId"));

  if (!mediaId) {
    throw new Error("Falta el medio a eliminar.");
  }

  const { error } = await supabase
    .from("product_media")
    .delete()
    .eq("organization_id", organizationId)
    .eq("id", mediaId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateMerchantPaths(["/app/catalogo"]);
}

export async function saveKnowledgeItemAction(
  _previousState: AppFormState,
  formData: FormData,
) {
  try {
    const { supabase, user, organizationId } = await getActionContext();
    const answer = normalizeText(formData.get("answer"));

    if (!answer) {
      throw new Error("La respuesta es obligatoria.");
    }

    const payload = {
      organization_id: organizationId,
      product_id: normalizeOptionalText(formData.get("productId")),
      kind: normalizeText(formData.get("kind")) || "faq",
      category: normalizeText(formData.get("category")) || "general",
      title: normalizeOptionalText(formData.get("title")),
      question: normalizeOptionalText(formData.get("question")),
      answer,
      priority: parseInteger(formData.get("priority"), 100),
      is_active: normalizeBoolean(formData.get("isActive")),
      created_by_user_id: user.id,
    };

    const { error } = await supabase.from("knowledge_items").insert(payload);

    if (error) {
      throw new Error(error.message);
    }

    revalidateMerchantPaths(["/app/catalogo"]);
    return successState("Respuesta comercial guardada.");
  } catch (error) {
    return errorState(error);
  }
}

export async function toggleKnowledgeItemAction(formData: FormData) {
  const { supabase, organizationId } = await getActionContext();
  const knowledgeItemId = normalizeText(formData.get("knowledgeItemId"));
  const isActive = normalizeBoolean(formData.get("isActive"));

  if (!knowledgeItemId) {
    throw new Error("Falta la respuesta comercial a actualizar.");
  }

  const { error } = await supabase
    .from("knowledge_items")
    .update({
      is_active: isActive,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", organizationId)
    .eq("id", knowledgeItemId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateMerchantPaths(["/app/catalogo"]);
}

export async function saveCatalogImportAction(
  _previousState: AppFormState,
  formData: FormData,
) {
  try {
    const { supabase, user, organizationId } = await getActionContext();
    const file = formData.get("file");

    if (!(file instanceof File) || file.size === 0) {
      throw new Error("Selecciona un archivo CSV para importar.");
    }

    const csvText = await file.text();
    const preview = parseCatalogCsvPreview(csvText);

    if (preview.totalRows === 0) {
      throw new Error("El CSV no tiene filas válidas para procesar.");
    }

    const { data, error } = await supabase
      .from("catalog_import_jobs")
      .insert({
        organization_id: organizationId,
        source_type: "csv",
        status: "queued",
        original_filename: file.name,
        content_type: file.type || "text/csv",
        total_rows: preview.totalRows,
        summary: getCatalogImportSummaryJson(preview),
        initiated_by_user_id: user.id,
      })
      .select("id")
      .single();

    if (error || !data) {
      throw new Error(error?.message ?? "No pudimos crear el job de importación.");
    }

    await queueCatalogImport({
      organizationId,
      importJobId: data.id,
      csvText,
      originalFilename: file.name,
    });

    revalidateMerchantPaths(["/app/catalogo", "/app/configuracion"]);
    return successState("Importación encolada. El worker procesará el archivo.");
  } catch (error) {
    return errorState(error);
  }
}

export async function saveCustomerAction(
  _previousState: AppFormState,
  formData: FormData,
) {
  try {
    const { supabase, organizationId } = await getActionContext();
    const whatsapp = normalizeText(formData.get("whatsapp"));

    if (!whatsapp) {
      throw new Error("El WhatsApp del cliente es obligatorio.");
    }

    const payload = {
      organization_id: organizationId,
      whatsapp_e164: whatsapp,
      full_name: normalizeOptionalText(formData.get("fullName")),
      email: normalizeEmail(formData.get("email")),
      preferred_language: normalizeText(formData.get("preferredLanguage")) || "es-DO",
      lead_temperature:
        (normalizeText(formData.get("leadTemperature")) || "cold") as LeadTemperature,
      notes: normalizeOptionalText(formData.get("notes")),
      last_seen_at: new Date().toISOString(),
    };

    const { data: existing, error: existingError } = await supabase
      .from("customers")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("whatsapp_e164", whatsapp)
      .maybeSingle();

    if (existingError) {
      throw new Error(existingError.message);
    }

    if (existing) {
      const { error } = await supabase
        .from("customers")
        .update(payload)
        .eq("organization_id", organizationId)
        .eq("id", existing.id);

      if (error) {
        throw new Error(error.message);
      }
    } else {
      const { error } = await supabase.from("customers").insert(payload);

      if (error) {
        throw new Error(error.message);
      }
    }

    revalidateMerchantPaths(["/app/clientes", "/app/pedidos", "/app/inbox"]);
    return successState("Cliente guardado.");
  } catch (error) {
    return errorState(error);
  }
}

export async function updateCustomerLeadAction(formData: FormData) {
  const { supabase, organizationId } = await getActionContext();
  const customerId = normalizeText(formData.get("customerId"));

  if (!customerId) {
    throw new Error("Falta el cliente a actualizar.");
  }

  const { error } = await supabase
    .from("customers")
    .update({
      lead_temperature:
        (normalizeText(formData.get("leadTemperature")) || "cold") as LeadTemperature,
      notes: normalizeOptionalText(formData.get("notes")),
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", organizationId)
    .eq("id", customerId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateMerchantPaths(["/app/clientes", "/app/inbox", "/app"]);
}

export async function saveOrderAction(
  _previousState: AppFormState,
  formData: FormData,
) {
  try {
    const { supabase, organizationId } = await getActionContext();
    const conversationId = normalizeOptionalText(formData.get("conversationId"));
    let customerId = normalizeText(formData.get("customerId"));
    const subtotal = parseDecimal(formData.get("subtotal"));
    const shippingFee = parseDecimal(formData.get("shippingFee"));
    const discountTotal = parseDecimal(formData.get("discountTotal"));
    let channelId = await getPrimaryChannelId(supabase, organizationId);

    if (conversationId) {
      const { data: conversation, error: conversationError } = await supabase
        .from("conversations")
        .select("id, customer_id, channel_id")
        .eq("organization_id", organizationId)
        .eq("id", conversationId)
        .single();

      if (conversationError || !conversation) {
        throw new Error(conversationError?.message ?? "No encontramos la conversación.");
      }

      customerId = conversation.customer_id;
      channelId = conversation.channel_id;
    }

    if (!customerId) {
      throw new Error("Selecciona un cliente para crear el pedido.");
    }

    if (subtotal <= 0) {
      throw new Error("El subtotal debe ser mayor que cero.");
    }

    const status = normalizeText(formData.get("status")) || "awaiting_payment";
    const paymentStatus = normalizeText(formData.get("paymentStatus")) || "pending";
    const fulfillmentStatus =
      normalizeText(formData.get("fulfillmentStatus")) || "unfulfilled";
    const totalAmount = Math.max(subtotal + shippingFee - discountTotal, 0);

    const { data: order, error } = await supabase
      .from("orders")
      .insert({
        organization_id: organizationId,
        customer_id: customerId,
        channel_id: channelId,
        conversation_id: conversationId,
        subtotal,
        shipping_fee: shippingFee,
        discount_total: discountTotal,
        total_amount: totalAmount,
        currency_code: normalizeText(formData.get("currencyCode")) || "DOP",
        status,
        payment_status: paymentStatus,
        fulfillment_status: fulfillmentStatus,
        placed_at: status === "draft" ? null : new Date().toISOString(),
        shipping_name: normalizeOptionalText(formData.get("shippingName")),
        shipping_phone: normalizeOptionalText(formData.get("shippingPhone")),
        shipping_province: normalizeOptionalText(formData.get("shippingProvince")),
        shipping_municipio: normalizeOptionalText(formData.get("shippingMunicipio")),
        shipping_sector: normalizeOptionalText(formData.get("shippingSector")),
        delivery_notes: normalizeOptionalText(formData.get("deliveryNotes")),
        metadata: {},
      })
      .select("id, customer_id")
      .single();

    if (error || !order) {
      throw new Error(error?.message ?? "No pudimos crear el pedido.");
    }

    if (conversationId) {
      await supabase
        .from("conversations")
        .update({
          status: "awaiting_payment",
          last_message_at: new Date().toISOString(),
        })
        .eq("organization_id", organizationId)
        .eq("id", conversationId);

      await scheduleConversationSummary({
        organizationId,
        conversationId,
      });
    }

    if (conversationId && (paymentStatus === "pending" || status === "awaiting_payment")) {
      await scheduleFollowUpsForConversation({
        organizationId,
        conversationId,
        customerId: order.customer_id,
        orderId: order.id,
        triggerType: "payment_reminder",
      }).catch(() => undefined);
    }

    revalidateMerchantPaths(["/app/pedidos", "/app/pagos", "/app/inbox", "/app"]);
    return successState("Pedido creado.");
  } catch (error) {
    return errorState(error);
  }
}

export async function saveOrderItemAction(
  _previousState: AppFormState,
  formData: FormData,
) {
  try {
    const { supabase, organizationId } = await getActionContext();
    const orderId = normalizeText(formData.get("orderId"));
    const productId = normalizeOptionalText(formData.get("productId"));
    const variantId = normalizeOptionalText(formData.get("variantId"));
    const quantity = parseInteger(formData.get("quantity"), 1);
    const manualName = normalizeOptionalText(formData.get("name"));
    const manualUnitPrice = parseDecimal(formData.get("unitPrice"));

    if (!orderId) {
      throw new Error("Selecciona un pedido para agregar la línea.");
    }

    if (quantity <= 0) {
      throw new Error("La cantidad debe ser mayor que cero.");
    }

    let name = manualName ?? "";
    let unitPrice = manualUnitPrice;
    let sku: string | null = null;
    let variantName: string | null = null;
    let currencyCode = normalizeText(formData.get("currencyCode")) || "DOP";

    if (productId) {
      const { data: product, error: productError } = await supabase
        .from("products")
        .select("id, name, price, sku, currency_code")
        .eq("organization_id", organizationId)
        .eq("id", productId)
        .single();

      if (productError || !product) {
        throw new Error(productError?.message ?? "No encontramos el producto seleccionado.");
      }

      name = product.name;
      unitPrice = product.price;
      sku = product.sku;
      currencyCode = product.currency_code;
    }

    if (variantId) {
      const { data: variant, error: variantError } = await supabase
        .from("product_variants")
        .select("id, name, sku, price_override")
        .eq("organization_id", organizationId)
        .eq("id", variantId)
        .single();

      if (variantError || !variant) {
        throw new Error(variantError?.message ?? "No encontramos la variante seleccionada.");
      }

      variantName = variant.name;
      sku = variant.sku ?? sku;
      unitPrice = variant.price_override ?? unitPrice;
    }

    if (!name || unitPrice <= 0) {
      throw new Error("La línea necesita un nombre y un precio válido.");
    }

    const { error } = await supabase.from("order_items").insert({
      organization_id: organizationId,
      order_id: orderId,
      product_id: productId,
      variant_id: variantId,
      name,
      sku,
      quantity,
      unit_price: unitPrice,
      variant_name: variantName,
      currency_code: currencyCode,
    });

    if (error) {
      throw new Error(error.message);
    }

    await refreshOrderTotals(organizationId, orderId);

    revalidateMerchantPaths(["/app/pedidos", "/app/inbox", "/app/pagos"]);
    return successState("Línea agregada al pedido.");
  } catch (error) {
    return errorState(error);
  }
}

export async function deleteOrderItemAction(formData: FormData) {
  const { supabase, organizationId } = await getActionContext();
  const orderItemId = normalizeText(formData.get("orderItemId"));
  const orderId = normalizeText(formData.get("orderId"));

  if (!orderItemId || !orderId) {
    throw new Error("Falta la línea o el pedido.");
  }

  const { error } = await supabase
    .from("order_items")
    .delete()
    .eq("organization_id", organizationId)
    .eq("id", orderItemId);

  if (error) {
    throw new Error(error.message);
  }

  await refreshOrderTotals(organizationId, orderId);
  revalidateMerchantPaths(["/app/pedidos", "/app/inbox", "/app/pagos"]);
}

export async function savePaymentConfigAction(
  _previousState: AppFormState,
  formData: FormData,
) {
  try {
    const { supabase, organizationId } = await getActionContext();
    const providerCode = normalizeText(formData.get("providerCode"));
    const methodTypeCode = normalizeText(formData.get("methodTypeCode"));

    if (!providerCode || !methodTypeCode) {
      throw new Error("Selecciona proveedor y método.");
    }

    const captureModeCode =
      normalizeText(formData.get("captureModeCode")) || "sale";
    const isDefault = normalizeBoolean(formData.get("isDefault"));

    if (isDefault) {
      const { error: resetError } = await supabase
        .from("organization_payment_configs")
        .update({ is_default: false })
        .eq("organization_id", organizationId);

      if (resetError) {
        throw new Error(resetError.message);
      }
    }

    const { data: existing, error: existingError } = await supabase
      .from("organization_payment_configs")
      .select("id, vault_secret_ref, config")
      .eq("organization_id", organizationId)
      .eq("provider_code", providerCode)
      .eq("method_type_code", methodTypeCode)
      .maybeSingle();

    if (existingError) {
      throw new Error(existingError.message);
    }

    const payload = {
      organization_id: organizationId,
      provider_code: providerCode,
      method_type_code: methodTypeCode,
      capture_mode_code: captureModeCode,
      is_enabled: normalizeBoolean(formData.get("isEnabled")),
      is_default: isDefault,
      vault_secret_ref: existing?.vault_secret_ref ?? null,
      config: existing?.config ?? ({} as Json),
    };

    if (existing) {
      const { error } = await supabase
        .from("organization_payment_configs")
        .update(payload)
        .eq("organization_id", organizationId)
        .eq("id", existing.id);

      if (error) {
        throw new Error(error.message);
      }
    } else {
      const { error } = await supabase
        .from("organization_payment_configs")
        .insert(payload);

      if (error) {
        throw new Error(error.message);
      }
    }

    revalidateMerchantPaths(["/app/pagos", "/app/configuracion"]);
    return successState("Configuración de pago guardada.");
  } catch (error) {
    return errorState(error);
  }
}

export async function updatePaymentConfigStatusAction(formData: FormData) {
  const { supabase, organizationId } = await getActionContext();
  const configId = normalizeText(formData.get("configId"));

  if (!configId) {
    throw new Error("Falta la configuración de pago.");
  }

  const isDefault = normalizeBoolean(formData.get("isDefault"));

  if (isDefault) {
    const { error: resetError } = await supabase
      .from("organization_payment_configs")
      .update({ is_default: false })
      .eq("organization_id", organizationId);

    if (resetError) {
      throw new Error(resetError.message);
    }
  }

  const { error } = await supabase
    .from("organization_payment_configs")
    .update({
      is_enabled: normalizeBoolean(formData.get("isEnabled")),
      is_default: isDefault,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", organizationId)
    .eq("id", configId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateMerchantPaths(["/app/pagos", "/app/configuracion"]);
}

export async function saveFollowUpRuleAction(
  _previousState: AppFormState,
  formData: FormData,
) {
  try {
    const { supabase, user, organizationId } = await getActionContext();
    const name = normalizeText(formData.get("name"));
    const sendMode = normalizeText(formData.get("sendMode")) || "in_session_freeform";
    const templateId = normalizeOptionalText(formData.get("templateId"));
    const freeformBody = normalizeOptionalText(formData.get("freeformBody"));

    if (!name) {
      throw new Error("El nombre de la regla es obligatorio.");
    }

    if (sendMode === "template" && !templateId) {
      throw new Error("Selecciona una plantilla para esta regla.");
    }

    if (sendMode === "in_session_freeform" && !freeformBody) {
      throw new Error("Define el mensaje libre para esta regla.");
    }

    const payload = {
      organization_id: organizationId,
      name,
      trigger_type: normalizeText(formData.get("triggerType")) || "payment_reminder",
      target_type: normalizeText(formData.get("targetType")) || "conversation",
      send_mode: sendMode,
      delay_minutes: parseInteger(formData.get("delayMinutes"), 30),
      max_executions: parseInteger(formData.get("maxExecutions"), 1),
      template_id: sendMode === "template" ? templateId : null,
      freeform_body: sendMode === "in_session_freeform" ? freeformBody : null,
      stop_conditions: {
        stop_on_reply: normalizeBoolean(formData.get("stopOnReply")),
        stop_on_payment: normalizeBoolean(formData.get("stopOnPayment")),
        stop_on_human_takeover: normalizeBoolean(
          formData.get("stopOnHumanTakeover"),
        ),
      } as Json,
      is_active: normalizeBoolean(formData.get("isActive")),
      created_by_user_id: user.id,
    };

    const { data: existing, error: existingError } = await supabase
      .from("follow_up_rules")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("name", name)
      .maybeSingle();

    if (existingError) {
      throw new Error(existingError.message);
    }

    if (existing) {
      const { error } = await supabase
        .from("follow_up_rules")
        .update(payload)
        .eq("organization_id", organizationId)
        .eq("id", existing.id);

      if (error) {
        throw new Error(error.message);
      }
    } else {
      const { error } = await supabase.from("follow_up_rules").insert(payload);

      if (error) {
        throw new Error(error.message);
      }
    }

    revalidateMerchantPaths(["/app/automatizaciones", "/app"]);
    return successState("Regla de seguimiento guardada.");
  } catch (error) {
    return errorState(error);
  }
}

export async function toggleFollowUpRuleAction(formData: FormData) {
  const { supabase, organizationId } = await getActionContext();
  const ruleId = normalizeText(formData.get("ruleId"));
  const isActive = normalizeBoolean(formData.get("isActive"));

  if (!ruleId) {
    throw new Error("Falta la regla a actualizar.");
  }

  const { error } = await supabase
    .from("follow_up_rules")
    .update({
      is_active: isActive,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", organizationId)
    .eq("id", ruleId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateMerchantPaths(["/app/automatizaciones", "/app"]);
}

export async function saveOrganizationSettingsAction(
  _previousState: AppFormState,
  formData: FormData,
) {
  try {
    const { supabase, organizationId } = await getActionContext();
    const name = normalizeText(formData.get("name"));

    if (!name) {
      throw new Error("El nombre del negocio es obligatorio.");
    }

    const { error } = await supabase
      .from("organizations")
      .update({
        name,
        industry: normalizeOptionalText(formData.get("industry")),
        default_locale: normalizeText(formData.get("defaultLocale")) || "es-DO",
        timezone:
          normalizeText(formData.get("timezone")) || "America/Santo_Domingo",
        currency_code: normalizeText(formData.get("currencyCode")) || "DOP",
      })
      .eq("id", organizationId);

    if (error) {
      throw new Error(error.message);
    }

    revalidateMerchantPaths(["/app/configuracion", "/app"]);
    return successState("Configuración del negocio actualizada.");
  } catch (error) {
    return errorState(error);
  }
}

export async function saveWhatsAppChannelAction(
  _previousState: AppFormState,
  formData: FormData,
) {
  try {
    const { supabase, organizationId } = await getActionContext();
    const phone = normalizeText(formData.get("phoneE164"));
    const displayName = normalizeOptionalText(formData.get("displayName"));

    if (!phone) {
      throw new Error("El número de WhatsApp es obligatorio.");
    }

    await upsertPrimaryWhatsAppChannel({
      supabase,
      organizationId,
      phone,
      displayName,
    });

    revalidateMerchantPaths([
      "/app/configuracion",
      "/app/inbox",
      "/app/ia-vendedora",
    ]);
    return successState("Canal de WhatsApp guardado.");
  } catch (error) {
    return errorState(error);
  }
}

export async function startKapsoSetupLinkAction(formData: FormData) {
  const { supabase, organizationId } = await getActionContext();
  const phone = normalizeText(formData.get("phoneE164"));
  const displayName = normalizeOptionalText(formData.get("displayName"));

  const existingChannel = await getPrimaryChannel(supabase, organizationId);
  const channel =
    phone || displayName
      ? await upsertPrimaryWhatsAppChannel({
          supabase,
          organizationId,
          phone: phone || existingChannel?.phone_e164 || "",
          displayName: displayName ?? existingChannel?.display_name ?? null,
        })
      : existingChannel;

  if (!channel?.id) {
    throw new Error("Guarda primero un canal de WhatsApp antes de conectarlo con Kapso.");
  }

  if (!channel.phone_e164) {
    throw new Error("El canal necesita un número válido antes de iniciar la conexión en Kapso.");
  }

  const existingMetadata = toKapsoMetadata(channel.metadata);
  const customer = await ensureKapsoCustomer({
    externalCustomerId: organizationId,
    name: displayName ?? channel.display_name ?? channel.phone_e164,
  });
  const setupLink = await createKapsoSetupLink({
    customerId: customer.id,
    organizationId,
    channelId: channel.id,
  });

  const { error } = await supabase
    .from("whatsapp_channels")
    .update({
      provider: "kapso_platform" as ChannelProvider,
      metadata: {
        ...existingMetadata,
        kapso_customer_id: customer.id,
        kapso_customer_external_id: customer.external_customer_id,
        kapso_setup_link_id: setupLink.id,
        kapso_setup_link_url: setupLink.url,
        kapso_setup_link_status: setupLink.status,
        kapso_setup_link_expires_at: setupLink.expires_at,
        kapso_setup_status: setupLink.whatsapp_setup_status,
        kapso_setup_error: setupLink.whatsapp_setup_error,
      } satisfies KapsoChannelMetadata as unknown as Json,
    })
    .eq("organization_id", organizationId)
    .eq("id", channel.id);

  if (error) {
    throw new Error(error.message);
  }

  revalidateMerchantPaths(["/app/configuracion"]);
  redirect(setupLink.url);
}

export async function updateConversationAction(formData: FormData) {
  const { supabase, organizationId } = await getActionContext();
  const conversationId = normalizeText(formData.get("conversationId"));

  if (!conversationId) {
    throw new Error("Falta la conversación a actualizar.");
  }

  const aiPaused = normalizeBoolean(formData.get("aiPaused"));
  const status = normalizeText(formData.get("status")) || "open";
  const leadTemperature =
    (normalizeText(formData.get("leadTemperature")) || "warm") as LeadTemperature;

  const { data: conversation, error: conversationError } = await supabase
    .from("conversations")
    .select("id, customer_id")
    .eq("organization_id", organizationId)
    .eq("id", conversationId)
    .single();

  if (conversationError || !conversation) {
    throw new Error(conversationError?.message ?? "No encontramos la conversación.");
  }

  const { error } = await supabase
    .from("conversations")
    .update({
      ai_paused: aiPaused,
      ai_paused_at: aiPaused ? new Date().toISOString() : null,
      lead_temperature: leadTemperature,
      status,
      human_handoff_requested_at:
        status === "waiting_human" ? new Date().toISOString() : null,
      closed_at:
        status === "closed" || status === "lost"
          ? new Date().toISOString()
          : null,
    })
    .eq("organization_id", organizationId)
    .eq("id", conversationId);

  if (error) {
    throw new Error(error.message);
  }

  if (aiPaused || status === "waiting_human" || status === "closed" || status === "lost") {
    await cancelConversationFollowUps({
      organizationId,
      conversationId,
      reason: "La conversación cambió a un estado que detiene seguimientos automáticos.",
    });
  } else if (status === "waiting_customer") {
    await scheduleFollowUpsForConversation({
      organizationId,
      conversationId,
      customerId: conversation.customer_id,
      triggerType: "awaiting_customer",
    });
  }

  await scheduleConversationSummary({
    organizationId,
    conversationId,
  });

  revalidateMerchantPaths(["/app/inbox", "/app"]);
}

export async function attachOrderToConversationAction(
  _previousState: AppFormState,
  formData: FormData,
) {
  try {
    const { supabase, organizationId } = await getActionContext();
    const conversationId = normalizeText(formData.get("conversationId"));
    const orderId = normalizeText(formData.get("orderId"));

    if (!conversationId || !orderId) {
      throw new Error("Selecciona la conversación y el pedido.");
    }

    const [{ data: conversation, error: conversationError }, { data: order, error: orderError }] =
      await Promise.all([
        supabase
          .from("conversations")
          .select("id, customer_id, channel_id")
          .eq("organization_id", organizationId)
          .eq("id", conversationId)
          .single(),
        supabase
          .from("orders")
          .select("id, customer_id")
          .eq("organization_id", organizationId)
          .eq("id", orderId)
          .single(),
      ]);

    if (conversationError || !conversation) {
      throw new Error(conversationError?.message ?? "No encontramos la conversación.");
    }

    if (orderError || !order) {
      throw new Error(orderError?.message ?? "No encontramos el pedido.");
    }

    if (conversation.customer_id !== order.customer_id) {
      throw new Error(
        "Solo puedes vincular pedidos que pertenezcan al mismo cliente de la conversación.",
      );
    }

    const { error } = await supabase
      .from("orders")
      .update({
        conversation_id: conversationId,
        channel_id: conversation.channel_id,
      })
      .eq("organization_id", organizationId)
      .eq("id", orderId);

    if (error) {
      throw new Error(error.message);
    }

    await supabase
      .from("conversations")
      .update({
        status: "awaiting_payment",
      })
      .eq("organization_id", organizationId)
      .eq("id", conversationId);

    await scheduleConversationSummary({
      organizationId,
      conversationId,
    });

    revalidateMerchantPaths(["/app/inbox", "/app/pedidos", "/app/pagos"]);
    return successState("Pedido vinculado a la conversación.");
  } catch (error) {
    return errorState(error);
  }
}

export async function createConversationOrderAction(
  _previousState: AppFormState,
  formData: FormData,
) {
  try {
    const { supabase, organizationId } = await getActionContext();
    const conversationId = normalizeText(formData.get("conversationId"));
    const subtotal = parseDecimal(formData.get("subtotal"));

    if (!conversationId) {
      throw new Error("Falta la conversación.");
    }

    if (subtotal <= 0) {
      throw new Error("El subtotal debe ser mayor que cero.");
    }

    const { data: conversation, error: conversationError } = await supabase
      .from("conversations")
      .select("id, customer_id, channel_id")
      .eq("organization_id", organizationId)
      .eq("id", conversationId)
      .single();

    if (conversationError || !conversation) {
      throw new Error(conversationError?.message ?? "No encontramos la conversación.");
    }

    const shippingFee = parseDecimal(formData.get("shippingFee"));
    const discountTotal = parseDecimal(formData.get("discountTotal"));
    const totalAmount = Math.max(subtotal + shippingFee - discountTotal, 0);

    const { data: order, error } = await supabase
      .from("orders")
      .insert({
        organization_id: organizationId,
        customer_id: conversation.customer_id,
        channel_id: conversation.channel_id,
        conversation_id: conversationId,
        subtotal,
        shipping_fee: shippingFee,
        discount_total: discountTotal,
        total_amount: totalAmount,
        currency_code: normalizeText(formData.get("currencyCode")) || "DOP",
        status: "awaiting_payment",
        payment_status: "pending",
        fulfillment_status: "unfulfilled",
        placed_at: new Date().toISOString(),
        shipping_name: normalizeOptionalText(formData.get("shippingName")),
        shipping_phone: normalizeOptionalText(formData.get("shippingPhone")),
        delivery_notes: normalizeOptionalText(formData.get("deliveryNotes")),
        metadata: {},
      })
      .select("id")
      .single();

    if (error || !order) {
      throw new Error(error?.message ?? "No pudimos crear el pedido.");
    }

    await supabase
      .from("conversations")
      .update({
        status: "awaiting_payment",
      })
      .eq("organization_id", organizationId)
      .eq("id", conversationId);

    await scheduleFollowUpsForConversation({
      organizationId,
      conversationId,
      customerId: conversation.customer_id,
      orderId: order.id,
      triggerType: "payment_reminder",
    });

    await scheduleConversationSummary({
      organizationId,
      conversationId,
    });

    revalidateMerchantPaths(["/app/inbox", "/app/pedidos", "/app/pagos", "/app"]);
    return successState("Pedido creado desde la conversación.");
  } catch (error) {
    return errorState(error);
  }
}

export async function queueConversationReplyAction(
  _previousState: AppFormState,
  formData: FormData,
) {
  try {
    const { supabase, user, organizationId } = await getActionContext();
    const conversationId = normalizeText(formData.get("conversationId"));
    const body = normalizeText(formData.get("body"));

    if (!conversationId || !body) {
      throw new Error("Escribe la respuesta y selecciona la conversación.");
    }

    const [{ data: conversation, error: conversationError }, paymentConfigs] =
      await Promise.all([
        supabase
          .from("conversations")
          .select("id, customer_id, channel_id")
          .eq("organization_id", organizationId)
          .eq("id", conversationId)
          .single(),
        getPaymentConfigsForOrganization(organizationId),
      ]);

    if (conversationError || !conversation) {
      throw new Error(conversationError?.message ?? "No encontramos la conversación.");
    }

    const readiness = getReadinessReport({
      sellerProfile: (
        await supabase
          .from("ai_seller_profiles")
          .select("*")
          .eq("organization_id", organizationId)
          .maybeSingle()
      ).data ?? null,
      channel: (
        await supabase
          .from("whatsapp_channels")
          .select("*")
          .eq("organization_id", organizationId)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle()
      ).data ?? null,
      paymentConfigs,
    });

    if (readiness.whatsapp.state !== "ready") {
      throw new Error(readiness.whatsapp.blockers[0] ?? "WhatsApp no está listo en este entorno.");
    }

    const { data: message, error: messageError } = await supabase
      .from("messages")
      .insert({
        organization_id: organizationId,
        channel_id: conversation.channel_id,
        conversation_id: conversationId,
        customer_id: conversation.customer_id,
        direction: "outbound",
        sender_type: "human",
        body,
        message_type: "text",
        current_status: "queued",
        current_status_at: new Date().toISOString(),
        payload: {
          source: "merchant_inbox",
        },
        sent_by_user_id: user.id,
      })
      .select("id")
      .single();

    if (messageError || !message) {
      throw new Error(messageError?.message ?? "No pudimos preparar el mensaje.");
    }

    const { error: statusError } = await supabase.from("message_status_events").insert({
      organization_id: organizationId,
      message_id: message.id,
      conversation_id: conversationId,
      channel_id: conversation.channel_id,
      canonical_status: "queued",
      metadata: {
        source: "merchant_inbox",
      },
    });

    if (statusError) {
      throw new Error(statusError.message);
    }

    const now = new Date().toISOString();

    await supabase
      .from("conversations")
      .update({
        status: "waiting_customer",
        ai_paused: true,
        ai_paused_at: now,
        last_agent_message_at: now,
        last_message_at: now,
      })
      .eq("organization_id", organizationId)
      .eq("id", conversationId);

    await enqueueScheduledJob({
      organizationId,
      jobType: "send_whatsapp_message",
      conversationId,
      customerId: conversation.customer_id,
      payload: {
        messageId: message.id,
        body,
      },
      dedupeKey: `${organizationId}:send:${message.id}`,
    });

    await scheduleFollowUpsForConversation({
      organizationId,
      conversationId,
      customerId: conversation.customer_id,
      triggerType: "awaiting_customer",
    });

    await scheduleConversationSummary({
      organizationId,
      conversationId,
    });

    revalidateMerchantPaths(["/app/inbox", "/app"]);
    return successState("Respuesta encolada para envío.");
  } catch (error) {
    return errorState(error);
  }
}

export async function updateOrderPipelineAction(formData: FormData) {
  const { supabase, organizationId } = await getActionContext();
  const orderId = normalizeText(formData.get("orderId"));

  if (!orderId) {
    throw new Error("Falta el pedido a actualizar.");
  }

  const status = normalizeText(formData.get("status")) || "awaiting_payment";
  const paymentStatus = normalizeText(formData.get("paymentStatus")) || "pending";

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, conversation_id, customer_id")
    .eq("organization_id", organizationId)
    .eq("id", orderId)
    .single();

  if (orderError || !order) {
    throw new Error(orderError?.message ?? "No encontramos el pedido.");
  }

  const { error } = await supabase
    .from("orders")
    .update({
      status,
      payment_status: paymentStatus,
      fulfillment_status:
        normalizeText(formData.get("fulfillmentStatus")) || "unfulfilled",
      paid_at: paymentStatus === "paid" ? new Date().toISOString() : null,
      closed_at:
        status === "closed" || status === "cancelled" || status === "lost"
          ? new Date().toISOString()
          : null,
    })
    .eq("organization_id", organizationId)
    .eq("id", orderId);

  if (error) {
    throw new Error(error.message);
  }

  if (
    paymentStatus === "paid" ||
    paymentStatus === "cancelled" ||
    status === "closed" ||
    status === "cancelled" ||
    status === "lost"
  ) {
    await cancelOrderRelatedJobs({
      organizationId,
      orderId,
      reason: "El estado del pedido ya no requiere seguimientos o reconciliación.",
    });
  } else if (paymentStatus === "pending" && order.conversation_id) {
    await scheduleFollowUpsForConversation({
      organizationId,
      conversationId: order.conversation_id,
      customerId: order.customer_id,
      orderId,
      triggerType: "payment_reminder",
    });
  }

  revalidateMerchantPaths(["/app/pedidos", "/app/pagos", "/app"]);
}

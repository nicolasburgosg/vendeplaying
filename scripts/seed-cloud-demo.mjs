import { createClient } from "@supabase/supabase-js";

function requireEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }

  return value;
}

const supabaseUrl = requireEnv("SUPABASE_URL");
const supabasePublishableKey = requireEnv("SUPABASE_PUBLISHABLE_KEY");
const supabaseServiceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
const email = process.env.DEMO_EMAIL ?? "demo@vendeto.local";
const password = process.env.DEMO_PASSWORD ?? "Vendeto123!";
const organizationName = process.env.DEMO_ORGANIZATION ?? "Cafe Demo VendeTo";
const fullName = process.env.DEMO_FULL_NAME ?? "Demo VendeTo";

const admin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const client = createClient(supabaseUrl, supabasePublishableKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const userList = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });

if (userList.error) {
  throw userList.error;
}

let user = userList.data.users.find((item) => item.email === email) ?? null;

if (!user) {
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      name: fullName,
      organization_name: organizationName,
    },
  });

  if (created.error) {
    throw created.error;
  }

  user = created.data.user;
}

const signIn = await client.auth.signInWithPassword({ email, password });

if (signIn.error) {
  throw signIn.error;
}

const bootstrap = await client.rpc("bootstrap_organization", {
  _name: organizationName,
  _slug: "cafe-demo-vendeto",
  _default_locale: "es-DO",
});

if (
  bootstrap.error &&
  !String(bootstrap.error.message).includes("already belongs to an organization")
) {
  throw bootstrap.error;
}

const membership = await client
  .from("organization_memberships")
  .select("organization_id")
  .eq("user_id", user.id)
  .eq("status", "active")
  .maybeSingle();

if (membership.error) {
  throw membership.error;
}

if (!membership.data) {
  throw new Error("No active membership found for demo user.");
}

const organizationId = membership.data.organization_id;

const existingChannel = await client
  .from("whatsapp_channels")
  .select("id")
  .eq("organization_id", organizationId)
  .limit(1)
  .maybeSingle();

if (existingChannel.error) {
  throw existingChannel.error;
}

if (!existingChannel.data) {
  const insertedChannel = await client.from("whatsapp_channels").insert({
    organization_id: organizationId,
    provider: "kapso_platform",
    status: "pending_verification",
    phone_e164: "+18095550001",
    display_name: organizationName,
  });

  if (insertedChannel.error) {
    throw insertedChannel.error;
  }
}

const products = [
  {
    name: "Cafe Santo Domingo 1 lb",
    sku: "CAFE-SD-1LB",
    description: "Cafe molido para venta directa por WhatsApp.",
    price: 425,
    stock_quantity: 18,
    source_type: "manual",
  },
  {
    name: "Cafe Molido 500g",
    sku: "CAFE-500",
    description: "Empaque de prueba",
    price: 250,
    stock_quantity: 12,
    source_type: "manual",
  },
];

for (const product of products) {
  const exists = await client
    .from("products")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("sku", product.sku)
    .maybeSingle();

  if (exists.error && exists.error.code !== "PGRST116") {
    throw exists.error;
  }

  if (!exists.data) {
    const inserted = await client.from("products").insert({
      organization_id: organizationId,
      name: product.name,
      sku: product.sku,
      description: product.description,
      price: product.price,
      stock_quantity: product.stock_quantity,
      status: "active",
      source_type: product.source_type,
      currency_code: "DOP",
      track_inventory: true,
      allow_backorder: false,
      metadata: {},
    });

    if (inserted.error) {
      throw inserted.error;
    }
  }
}

console.log(
  JSON.stringify(
    {
      ok: true,
      email,
      organizationId,
      userId: user.id,
    },
    null,
    2,
  ),
);

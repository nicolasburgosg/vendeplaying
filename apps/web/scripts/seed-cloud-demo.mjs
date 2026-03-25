import { createClient } from "@supabase/supabase-js";
import { Pool } from "pg";

function requireEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }

  return value;
}

const supabaseUrl = requireEnv("SUPABASE_URL");
const supabasePublishableKey = requireEnv("SUPABASE_PUBLISHABLE_KEY");
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? null;
const databaseUrl = process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL ?? null;
const email = process.env.DEMO_EMAIL ?? "demo@vendeto.local";
const password = process.env.DEMO_PASSWORD ?? "Vendeto123!";
const organizationName = process.env.DEMO_ORGANIZATION ?? "Cafe Demo VendeTo";
const fullName = process.env.DEMO_FULL_NAME ?? "Demo VendeTo";

const admin = supabaseServiceRoleKey
  ? createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null;

const client = createClient(supabaseUrl, supabasePublishableKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function ensureAuthUserViaSql() {
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL or SUPABASE_DB_URL is required when falling back to direct auth bootstrap.",
    );
  }

  const pool = new Pool({
    connectionString: databaseUrl,
  });

  try {
    const existingUser = await pool.query(
      `
        select id, email
        from auth.users
        where email = $1
        limit 1
      `,
      [email],
    );

    let userId = existingUser.rows[0]?.id ?? null;

    if (!userId) {
      const insertedUser = await pool.query(
        `
          insert into auth.users (
            instance_id,
            id,
            aud,
            role,
            email,
            encrypted_password,
            email_confirmed_at,
            confirmation_token,
            recovery_token,
            email_change_token_new,
            email_change,
            email_change_token_current,
            phone_change,
            phone_change_token,
            reauthentication_token,
            raw_app_meta_data,
            raw_user_meta_data,
            created_at,
            updated_at
          )
          values (
            '00000000-0000-0000-0000-000000000000',
            gen_random_uuid(),
            'authenticated',
            'authenticated',
            $1,
            extensions.crypt($2, extensions.gen_salt('bf', 10)),
            now(),
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '{"provider":"email","providers":["email"]}'::jsonb,
            jsonb_build_object(
              'full_name', $3::text,
              'email_verified', true,
              'organization_name', $4::text
            ),
            now(),
            now()
          )
          returning id
        `,
        [email, password, fullName, organizationName],
      );

      userId = insertedUser.rows[0]?.id ?? null;
    } else {
      await pool.query(
        `
          update auth.users
          set
            instance_id = '00000000-0000-0000-0000-000000000000',
            aud = 'authenticated',
            role = 'authenticated',
            encrypted_password = extensions.crypt($2, extensions.gen_salt('bf', 10)),
            email_confirmed_at = coalesce(email_confirmed_at, now()),
            confirmation_token = '',
            recovery_token = '',
            email_change_token_new = '',
            email_change = '',
            email_change_token_current = '',
            phone_change = '',
            phone_change_token = '',
            reauthentication_token = '',
            raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb,
            raw_user_meta_data = jsonb_build_object(
              'full_name', $3::text,
              'email_verified', true,
              'organization_name', $4::text
            ),
            updated_at = now()
          where email = $1
        `,
        [email, password, fullName, organizationName],
      );
    }

    if (!userId) {
      throw new Error("Unable to create or update the demo auth user.");
    }

    await pool.query(
      `
        insert into auth.identities (
          provider_id,
          user_id,
          identity_data,
          provider,
          created_at,
          updated_at
        )
        values (
          $1::text,
          $1::uuid,
          jsonb_build_object(
            'sub', $1::text,
            'email', $2::text,
            'email_verified', true,
            'phone_verified', false
          ),
          'email',
          now(),
          now()
        )
        on conflict (provider_id, provider)
        do update set
          identity_data = excluded.identity_data,
          updated_at = now()
      `,
      [userId, email],
    );

    return {
      id: userId,
      email,
    };
  } finally {
    await pool.end();
  }
}

async function ensureAuthUser() {
  if (admin) {
    try {
      const userList = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });

      if (userList.error) {
        throw userList.error;
      }

      const existing = userList.data.users.find((item) => item.email === email) ?? null;

      if (existing) {
        return existing;
      }

      const created = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
          organization_name: organizationName,
        },
      });

      if (created.error) {
        throw created.error;
      }

      if (created.data.user) {
        return created.data.user;
      }
    } catch (error) {
      console.warn(
        `Falling back to direct auth bootstrap because admin auth failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return ensureAuthUserViaSql();
}

const user = await ensureAuthUser();

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

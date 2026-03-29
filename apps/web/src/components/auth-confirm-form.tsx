"use client";

import { type EmailOtpType } from "@supabase/supabase-js";
import { useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";

function normalizeNextPath(value: string | null, fallback: string) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return fallback;
  }

  try {
    const normalized = new URL(value, "http://vendeto.local");
    return `${normalized.pathname}${normalized.search}${normalized.hash}`;
  } catch {
    return fallback;
  }
}

export function AuthConfirmForm() {
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    let cancelled = false;
    const currentUrl = new URL(window.location.href);
    const hashParams = new URLSearchParams(currentUrl.hash.replace(/^#/, ""));
    const next = normalizeNextPath(currentUrl.searchParams.get("next"), "/app");
    const accessToken = hashParams.get("access_token");
    const refreshToken = hashParams.get("refresh_token");
    const hasImplicitTokens = Boolean(accessToken && refreshToken);

    function redirectToNext() {
      if (cancelled) {
        return;
      }

      window.location.assign(next);
    }

    function redirectToError() {
      if (cancelled) {
        return;
      }

      window.location.assign("/auth/auth-code-error");
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        return;
      }

      redirectToNext();
    });

    async function confirmAccess() {
      const tokenHash = currentUrl.searchParams.get("token_hash");
      const type = currentUrl.searchParams.get("type") as EmailOtpType | null;

      if (tokenHash && type) {
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type,
        });

        if (error) {
          redirectToError();
          return;
        }

        redirectToNext();
        return;
      }

      if (hasImplicitTokens && accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (error) {
          redirectToError();
          return;
        }

        redirectToNext();
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session?.user) {
        redirectToNext();
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        redirectToNext();
        return;
      }

      if (hasImplicitTokens) {
        window.setTimeout(async () => {
          if (cancelled) {
            return;
          }

          const {
            data: { session: delayedSession },
          } = await supabase.auth.getSession();

          if (delayedSession?.user) {
            redirectToNext();
            return;
          }

          const {
            data: { user: delayedUser },
          } = await supabase.auth.getUser();

          if (delayedUser) {
            redirectToNext();
            return;
          }

          redirectToError();
        }, 1200);

        return;
      }

      redirectToError();
    }

    confirmAccess().catch(() => {
      redirectToError();
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [supabase]);

  return (
    <div className="mt-8 rounded-lg border border-line bg-surface px-4 py-3 text-sm text-muted">
      Confirmando tu enlace. Te llevaremos al panel en unos segundos.
    </div>
  );
}

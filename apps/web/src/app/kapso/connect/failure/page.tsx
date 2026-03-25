type KapsoFailurePageProps = {
  searchParams: Promise<{
    reason?: string;
  }>;
};

const REASONS: Record<string, string> = {
  "missing-context": "Faltó contexto para terminar la conexión en el fork local.",
  "setup-not-complete": "Kapso no devolvió una conexión completada.",
  "channel-not-found": "No encontramos el canal de WhatsApp que debía actualizarse.",
  unknown: "La conexión de Kapso falló antes de guardar el canal.",
};

export default async function KapsoConnectFailurePage({
  searchParams,
}: KapsoFailurePageProps) {
  const { reason } = await searchParams;
  const normalizedReason = reason ?? "unknown";
  const detail = REASONS[normalizedReason] ?? `Kapso devolvió: ${normalizedReason}.`;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center gap-6 px-6 py-16">
      <p className="text-sm font-semibold uppercase tracking-[0.24em] text-muted">
        Kapso
      </p>
      <h1 className="text-4xl font-semibold text-foreground">
        No pudimos cerrar la conexión de WhatsApp
      </h1>
      <p className="max-w-2xl text-base leading-8 text-muted">{detail}</p>
      <a
        href="/app/configuracion"
        className="inline-flex w-fit items-center rounded-full border border-line px-5 py-3 text-sm font-semibold text-foreground transition hover:border-foreground"
      >
        Volver a configuración
      </a>
    </main>
  );
}

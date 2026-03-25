import { AppPageIntro } from "@/components/app-page-intro";
import { startKapsoSetupLinkAction } from "@/app/app/actions";
import { ReadinessPanel } from "@/components/readiness-panel";
import {
  OrganizationSettingsForm,
  WhatsAppChannelForm,
} from "@/components/settings-forms";
import { StatusPill } from "@/components/status-pill";
import { formatDateTime } from "@/lib/format";
import {
  labelCaptureMode,
  labelImportJobStatus,
  labelJobStatus,
  labelJobType,
  labelPaymentMethod,
  labelPaymentProvider,
  labelTemplateCategory,
  labelTemplateStatus,
  labelQualityRating,
} from "@/lib/labels";
import { getSettingsPageData } from "@/lib/merchant";

export default async function ConfiguracionPage() {
  const { context, paymentConfigs, templates, importJobs, operationJobs, readiness } =
    await getSettingsPageData();
  const paymentConfigRows = paymentConfigs ?? [];
  const templateRows = templates ?? [];
  const importJobRows = importJobs ?? [];
  const channelMetadata =
    context.channel?.metadata && typeof context.channel.metadata === "object" && !Array.isArray(context.channel.metadata)
      ? (context.channel.metadata as Record<string, unknown>)
      : null;
  const webhooksSkipped = channelMetadata?.kapso_webhooks_skipped === true;
  const setupLinkUrl =
    typeof channelMetadata?.kapso_setup_link_url === "string"
      ? channelMetadata.kapso_setup_link_url
      : null;
  const kapsoConnectionStatus = context.channel
    ? context.channel.status === "connected"
      ? webhooksSkipped
        ? "Canal conectado. La sincronización automática de webhooks se omitió porque este entorno no expone un API HTTPS público."
        : "Canal conectado en Kapso y listo para envíos."
      : setupLinkUrl
        ? "Hay un enlace de conexión activo para terminar la conexión en Kapso."
        : "Guarda el canal y luego genera el enlace de conexión de Kapso."
    : "Guarda el número primero y luego inicia la conexión con Kapso.";
  const kapsoConnectionHint = webhooksSkipped
    ? "Para recibir mensajes y estados en tiempo real desde Kapso en local, expón el API con una URL HTTPS pública y vuelve a reconectar el canal."
    : "Kapso devuelve el número conectado al panel y registra webhooks automáticamente cuando el API público del entorno es accesible.";
  const kapsoConnectionAction = context.channel ? (
    <form action={startKapsoSetupLinkAction}>
      <input type="hidden" name="phoneE164" value={context.channel.phone_e164} />
      <input
        type="hidden"
        name="displayName"
        value={context.channel.display_name ?? ""}
      />
      <button
        type="submit"
        className="inline-flex items-center rounded-full border border-line px-4 py-2 text-sm font-semibold text-foreground transition hover:border-foreground"
      >
        {context.channel.status === "connected" ? "Reconectar con Kapso" : "Conectar con Kapso"}
      </button>
    </form>
  ) : null;

  return (
    <>
      <AppPageIntro
        eyebrow="Configuracion"
        title="Estado del negocio e integraciones"
        description="Lectura operativa de organización, canal, pagos, plantillas e importaciones desde el panel de VendeTo."
        aside={<StatusPill tone="accent">{context.organization.defaultLocale}</StatusPill>}
      />

      <section className="site-section">
        <div className="grid gap-10 xl:grid-cols-2">
          <div>
            <p className="site-kicker">Negocio</p>
            <OrganizationSettingsForm
              organization={{
                name: context.organization.name,
                defaultLocale: context.organization.defaultLocale,
                timezone: context.organization.timezone,
                currencyCode: context.organization.currencyCode,
                industry: context.organization.industry,
              }}
            />
          </div>
          <div>
            <p className="site-kicker">Canal de WhatsApp</p>
            <WhatsAppChannelForm
              channel={context.channel}
              connectionStatus={kapsoConnectionStatus}
              connectionAction={kapsoConnectionAction}
              connectionHint={kapsoConnectionHint}
            />
          </div>
        </div>
      </section>

      <section className="site-section">
        <table className="site-table">
          <tbody>
            <tr>
              <th>Negocio</th>
              <td>{context.organization.name}</td>
            </tr>
            <tr>
              <th>Slug</th>
              <td>{context.organization.slug}</td>
            </tr>
            <tr>
              <th>Canal</th>
              <td>{context.channel?.phone_e164 ?? "Sin numero conectado"}</td>
            </tr>
            <tr>
              <th>Nombre para mostrar</th>
              <td>{context.channel?.display_name ?? "Pendiente de conexión"}</td>
            </tr>
            <tr>
              <th>Estado</th>
              <td>{context.channelStatusLabel}</td>
            </tr>
            <tr>
              <th>Calidad del número</th>
              <td>{labelQualityRating(context.channel?.quality_rating)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="site-section">
        <p className="site-kicker">Estado de configuración</p>
        <ReadinessPanel readiness={readiness} />
      </section>

      <section className="site-section">
        <div className="grid gap-10 xl:grid-cols-2">
          <div>
            <p className="site-kicker">Configuraciones de pago</p>
            {paymentConfigRows.length > 0 ? (
              <ul className="site-list mt-6 text-base leading-8 text-muted">
                {paymentConfigRows.map((config) => (
                  <li key={config.id}>
                    <span className="font-semibold text-foreground">
                      {labelPaymentProvider(config.provider_code)}
                    </span>
                    {` · ${labelPaymentMethod(config.method_type_code)} · ${labelCaptureMode(config.capture_mode_code)} · `}
                    {config.is_enabled ? "Activa" : "Pausada"}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="site-note mt-6">Sin configuraciones de pago activas.</p>
            )}
          </div>

          <div>
            <p className="site-kicker">Últimas importaciones</p>
            {importJobRows.length > 0 ? (
              <ul className="site-list mt-6 text-base leading-8 text-muted">
                {importJobRows.map((job) => (
                  <li key={job.id}>
                    <span className="font-semibold text-foreground">
                      {job.original_filename ?? "Importacion manual"}
                    </span>
                    {` · ${labelImportJobStatus(job.status)} · ${formatDateTime(job.updated_at)}`}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="site-note mt-6">Sin jobs de importacion recientes.</p>
            )}
          </div>
        </div>
      </section>

      <section className="site-section">
        <p className="site-kicker">Plantillas aprobadas</p>
        {templateRows.length > 0 ? (
          <table className="site-table mt-6">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Categoría</th>
                <th>Estado</th>
                <th>Idioma</th>
              </tr>
            </thead>
            <tbody>
              {templateRows.map((template) => (
                <tr key={template.id}>
                  <td className="font-semibold text-foreground">{template.name}</td>
                  <td className="text-sm text-muted">
                    {labelTemplateCategory(template.category_code)}
                  </td>
                  <td className="text-sm text-muted">
                    {labelTemplateStatus(template.status_code)}
                  </td>
                  <td className="text-sm text-muted">{template.language_code}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="site-note mt-6">Aún no hay plantillas registradas.</p>
        )}
      </section>

      <section className="site-section">
        <p className="site-kicker">Jobs internos recientes</p>
        {operationJobs.length > 0 ? (
          <table className="site-table mt-6">
            <thead>
              <tr>
                <th>Tarea</th>
                <th>Estado</th>
                <th>Último intento</th>
                <th>Detalle</th>
              </tr>
            </thead>
            <tbody>
              {operationJobs.map((job) => (
                <tr key={job.id}>
                  <td className="font-semibold text-foreground">
                    {labelJobType(job.job_type)}
                  </td>
                  <td className="text-sm text-muted">
                    {labelJobStatus(job.status)}
                    {job.latest_run_status ? ` · ${labelJobStatus(job.latest_run_status)}` : ""}
                  </td>
                  <td className="text-sm text-muted">
                    {formatDateTime(job.latest_run_finished_at ?? job.updated_at)}
                  </td>
                  <td className="text-sm text-muted">
                    {job.last_error ?? job.latest_run_error ?? "Sin incidencias registradas."}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="site-note mt-6">Todavía no hay jobs internos para mostrar.</p>
        )}
      </section>
    </>
  );
}

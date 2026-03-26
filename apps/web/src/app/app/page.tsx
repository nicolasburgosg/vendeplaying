import { AppPageIntro } from "@/components/app-page-intro";
import { ReadinessPanel } from "@/components/readiness-panel";
import { StatusPill } from "@/components/status-pill";
import { formatCount, formatCurrency, formatDateTime } from "@/lib/format";
import {
  labelConversationStatus,
  labelFollowUpTrigger,
  labelJobStatus,
  labelJobType,
  labelLeadTemperature,
  labelOrderPaymentStatus,
  labelOrderStatus,
} from "@/lib/labels";
import { getSummaryPageData } from "@/lib/merchant";

export default async function DashboardPage() {
  const {
    context,
    metrics,
    recentConversations,
    recentOrders,
    automations,
    operationJobs,
    readiness,
  } = await getSummaryPageData();

  const isOnboarding =
    readiness.ai.state !== "ready" ||
    readiness.whatsapp.state !== "ready" ||
    readiness.payments.state !== "ready";

  const hasData = recentConversations.length > 0 || recentOrders.length > 0;

  return (
    <>
      <AppPageIntro
        eyebrow="Inicio"
        title="Operación comercial"
        description={
          isOnboarding
            ? "Completa estos pasos para activar tu vendedor y empezar a vender por WhatsApp."
            : "Vista general del negocio: conversaciones, cobros, automatizaciones y señales del canal."
        }
        aside={<StatusPill tone="success">{context.channelStatusLabel}</StatusPill>}
      />

      {isOnboarding && (
        <section className="app-section">
          <div className="app-card space-y-6 p-6">
            <div className="flex items-center justify-between">
              <p className="text-base font-semibold">Configura tu negocio</p>
              <span className="text-xs tabular-nums text-muted">
                {[readiness.ai, readiness.whatsapp, readiness.payments].filter(
                  (report) => report.state === "ready",
                ).length}
                /3&nbsp;listos
              </span>
            </div>
            <ReadinessPanel readiness={readiness} />
          </div>
        </section>
      )}

      {(!isOnboarding || hasData) && (
        <section className="app-section">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {metrics.map((metric) => (
              <div key={metric.title} className="site-metric">
                <p className="app-label">{metric.title}</p>
                <p className="mt-2 text-4xl font-bold tabular-nums tracking-tight">
                  {formatCount(metric.value)}
                </p>
                <p className="mt-1 text-sm text-muted">{metric.detail}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {!isOnboarding && (
        <section className="app-section">
          <div className="app-card">
            <p className="app-label">Estado de arranque</p>
            <div className="mt-4">
              <ReadinessPanel readiness={readiness} compact />
            </div>
          </div>
        </section>
      )}

      {hasData && (
        <section className="app-section">
          <div className="grid gap-4 xl:grid-cols-2">
            {recentConversations.length > 0 && (
              <div className="app-card">
                <p className="app-label mb-4">Conversaciones recientes</p>
                <table className="site-table">
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th>Estado</th>
                      <th>Lead</th>
                      <th>Último</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentConversations.map((conversation) => (
                      <tr key={conversation.id}>
                        <td>
                          <p className="font-semibold text-foreground">
                            {conversation.customer?.full_name ?? "Sin nombre"}
                          </p>
                          <p className="text-xs text-muted">
                            {conversation.customer?.whatsapp_e164 ?? "Sin teléfono"}
                          </p>
                        </td>
                        <td className="text-sm text-muted">
                          {conversation.ai_paused
                            ? "Control humano"
                            : labelConversationStatus(conversation.status)}
                        </td>
                        <td className="text-sm text-muted">
                          {labelLeadTemperature(conversation.lead_temperature)}
                        </td>
                        <td className="text-sm text-muted">
                          {formatDateTime(conversation.last_message_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {recentOrders.length > 0 && (
              <div className="app-card">
                <p className="app-label mb-4">Órdenes recientes</p>
                <table className="site-table">
                  <thead>
                    <tr>
                      <th>Orden</th>
                      <th>Estado</th>
                      <th>Pago</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentOrders.map((order) => (
                      <tr key={order.id}>
                        <td className="font-semibold text-foreground">
                          #{order.order_number}
                        </td>
                        <td className="text-sm text-muted">
                          {labelOrderStatus(order.status)}
                        </td>
                        <td className="text-sm text-muted">
                          {labelOrderPaymentStatus(order.payment_status)}
                        </td>
                        <td className="text-sm text-muted">
                          {formatCurrency(order.total_amount, order.currency_code)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}

      {automations.length > 0 && (
        <section className="app-section">
          <div className="app-card">
            <p className="app-label mb-4">Automatizaciones</p>
            <ul className="site-list text-sm leading-7 text-muted">
              {automations.map((rule) => (
                <li key={rule.id}>
                  <span className="font-semibold text-foreground">{rule.name}</span>
                  {` · ${labelFollowUpTrigger(rule.trigger_type)} · ${rule.delay_minutes} min · `}
                  {rule.is_active ? "Activa" : "Pausada"}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {operationJobs.length > 0 && (
        <section className="app-section">
          <div className="app-card">
            <p className="app-label mb-4">Operaciones internas</p>
            <table className="site-table">
              <thead>
                <tr>
                  <th>Tarea</th>
                  <th>Estado</th>
                  <th>Último</th>
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
                      {job.latest_run_status
                        ? ` · ${labelJobStatus(job.latest_run_status)}`
                        : ""}
                    </td>
                    <td className="text-sm text-muted">
                      {formatDateTime(job.latest_run_finished_at ?? job.updated_at)}
                    </td>
                    <td className="text-sm text-muted">
                      {job.last_error ?? job.latest_run_error ?? "Sin incidencias."}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}

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
  const { context, metrics, recentConversations, recentOrders, automations, operationJobs, readiness } =
    await getSummaryPageData();

  return (
    <>
      <AppPageIntro
        eyebrow="Resumen"
        title="Operacion comercial"
        description="Vista general del negocio: conversaciones activas, cobros, automatizaciones y senales del canal en una sola lectura."
        aside={<StatusPill tone="success">{context.channelStatusLabel}</StatusPill>}
      />

      <section className="site-section">
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {metrics.map((metric) => (
            <div key={metric.title} className="border-t border-line pt-4">
              <p className="text-sm text-muted">{metric.title}</p>
              <p className="mt-3 text-4xl font-semibold">
                {formatCount(metric.value)}
              </p>
              <p className="mt-3 text-sm leading-7 text-muted">{metric.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="site-section">
        <p className="site-kicker">Estado de arranque</p>
        <ReadinessPanel readiness={readiness} compact />
      </section>

      <section className="site-section">
        <div className="grid gap-8 lg:grid-cols-[0.75fr_1.25fr]">
          <div>
            <p className="site-kicker">Estado actual</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight">
              Estado operativo del negocio hoy.
            </h2>
          </div>
          <ul className="site-list text-base leading-8 text-muted">
            <li>
              Organizacion activa: <strong className="text-foreground">{context.organization.name}</strong>
            </li>
            <li>
              Canal principal:{" "}
              <strong className="text-foreground">
                {context.channel?.phone_e164 ?? "Sin numero conectado"}
              </strong>
            </li>
            <li>
              Perfil IA:{" "}
              <strong className="text-foreground">
                {context.sellerProfile?.seller_name ?? "Pendiente"}
              </strong>
              {context.sellerProfile?.tone
                ? `, tono ${context.sellerProfile.tone}`
                : ""}
            </li>
            <li>
              Mensaje de bienvenida:{" "}
              <strong className="text-foreground">
                {context.sellerProfile?.welcome_message ? "Definido" : "Pendiente"}
              </strong>
            </li>
            <li>
              Slug del negocio: <strong className="text-foreground">{context.organization.slug}</strong>
            </li>
          </ul>
        </div>
      </section>

      <section className="site-section">
        <div className="grid gap-10 xl:grid-cols-2">
          <div>
            <p className="site-kicker">Conversaciones recientes</p>
            {recentConversations.length > 0 ? (
              <table className="site-table mt-6">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Estado</th>
                    <th>Lead</th>
                    <th>Ultimo movimiento</th>
                  </tr>
                </thead>
                <tbody>
                  {recentConversations.map((conversation) => (
                    <tr key={conversation.id}>
                      <td>
                        <p className="font-semibold text-foreground">
                          {conversation.customer?.full_name ?? "Contacto sin nombre"}
                        </p>
                        <p className="text-sm text-muted">
                          {conversation.customer?.whatsapp_e164 ?? "Sin telefono"}
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
            ) : (
              <p className="site-note mt-6">
                Aún no hay conversaciones para este negocio.
              </p>
            )}
          </div>

          <div>
            <p className="site-kicker">Ordenes recientes</p>
            {recentOrders.length > 0 ? (
              <table className="site-table mt-6">
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
            ) : (
              <p className="site-note mt-6">
                Aún no hay pedidos registrados.
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="site-section">
        <div className="grid gap-8 lg:grid-cols-[0.75fr_1.25fr]">
          <div>
            <p className="site-kicker">Automatizaciones</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight">
              Reglas listas para seguimiento y recordatorios.
            </h2>
          </div>
          {automations.length > 0 ? (
            <ul className="site-list text-base leading-8 text-muted">
              {automations.map((rule) => (
                <li key={rule.id}>
                  <span className="font-semibold text-foreground">{rule.name}</span>
                  {` · ${labelFollowUpTrigger(rule.trigger_type)} · ${rule.delay_minutes} min · `}
                  {rule.is_active ? "Activa" : "Pausada"}
                </li>
              ))}
            </ul>
          ) : (
            <p className="site-note">
              Aún no hay reglas de seguimiento configuradas.
            </p>
          )}
        </div>
      </section>

      <section className="site-section">
        <div className="grid gap-8 lg:grid-cols-[0.75fr_1.25fr]">
          <div>
            <p className="site-kicker">Operaciones internas</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight">
              Cola, bloqueos y tareas del worker.
            </h2>
          </div>
          {operationJobs.length > 0 ? (
            <table className="site-table">
              <thead>
                <tr>
                  <th>Tarea</th>
                  <th>Estado</th>
                  <th>Última actualización</th>
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
                      {job.latest_run_status ? ` · último intento ${labelJobStatus(job.latest_run_status)}` : ""}
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
          ) : (
            <p className="site-note">
              Aún no hay tareas internas ejecutadas para este negocio.
            </p>
          )}
        </div>
      </section>
    </>
  );
}

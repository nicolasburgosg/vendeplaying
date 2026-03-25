import { AppPageIntro } from "@/components/app-page-intro";
import { formatCurrency, formatDateTime, truncateMiddle } from "@/lib/format";
import {
  labelPaymentAttemptStatus,
  labelPaymentEvent,
  labelPaymentProvider,
  labelPaymentMethod,
} from "@/lib/labels";
import { getPaymentsPageData } from "@/lib/merchant";

export default async function PagosPage() {
  const {
    paymentConfigs,
    paymentAttempts,
    paymentEvents,
  } = await getPaymentsPageData();

  const activeConfig = paymentConfigs.find((c) => c.is_enabled);
  const hasActivity = paymentAttempts.length > 0 || paymentEvents.length > 0;

  return (
    <>
      <AppPageIntro
        eyebrow="Pagos"
        title="Pagos"
        description="Actividad de cobros realizados a través de WhatsApp."
      />

      {/* Payment method status */}
      <section className="app-section">
        <div className="app-card">
          <p className="app-label mb-3">Método de cobro</p>
          {activeConfig ? (
            <div className="flex items-center gap-3">
              <span className="inline-block h-2 w-2 rounded-full bg-accent" />
              <p className="text-sm text-foreground">
                {labelPaymentProvider(activeConfig.provider_code)} — {labelPaymentMethod(activeConfig.method_type_code)}
              </p>
              <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent-strong">
                Activo
              </span>
            </div>
          ) : (
            <p className="text-sm text-muted">
              El método de cobro se configura durante la activación de tu cuenta. Contacta soporte si necesitas ayuda.
            </p>
          )}
        </div>
      </section>

      {!hasActivity ? (
        <section className="app-section">
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted">
              <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
              <line x1="1" y1="10" x2="23" y2="10" />
            </svg>
            <p className="text-sm text-muted">No hay actividad de pagos todavía</p>
            <p className="max-w-xs text-xs text-muted">
              Los cobros aparecerán aquí cuando tus clientes paguen a través del enlace de WhatsApp.
            </p>
          </div>
        </section>
      ) : (
        <section className="app-section">
          <div className="grid gap-4 xl:grid-cols-2">
            {/* Recent payment attempts */}
            <div className="app-card">
              <p className="app-label mb-4">Cobros recientes</p>
              {paymentAttempts.length > 0 ? (
                <table className="site-table">
                  <thead>
                    <tr>
                      <th>Ref.</th>
                      <th>Monto</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paymentAttempts.map((attempt) => (
                      <tr key={attempt.id}>
                        <td className="text-sm text-muted">
                          {truncateMiddle(attempt.id)}
                        </td>
                        <td className="text-sm font-medium text-foreground">
                          {formatCurrency(attempt.amount, attempt.currency_code)}
                        </td>
                        <td>
                          <span className="inline-block rounded-full bg-background px-2.5 py-1 text-xs font-medium text-muted">
                            {labelPaymentAttemptStatus(attempt.status)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-sm text-muted">Sin cobros registrados.</p>
              )}
            </div>

            {/* Recent events */}
            <div className="app-card">
              <p className="app-label mb-4">Eventos recientes</p>
              {paymentEvents.length > 0 ? (
                <ul className="site-list text-sm text-muted">
                  {paymentEvents.map((event) => (
                    <li key={event.id} className="leading-relaxed">
                      <span className="font-semibold text-foreground">
                        {labelPaymentEvent(event.event_type)}
                      </span>
                      {event.normalized_status
                        ? ` — ${labelPaymentAttemptStatus(event.normalized_status)}`
                        : ""}
                      <br />
                      <span className="text-xs">
                        {formatDateTime(event.event_at)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">Sin eventos registrados.</p>
              )}
            </div>
          </div>
        </section>
      )}
    </>
  );
}

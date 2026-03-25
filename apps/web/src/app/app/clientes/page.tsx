import { AppPageIntro } from "@/components/app-page-intro";
import { formatDateTime } from "@/lib/format";
import { getCustomersPageData } from "@/lib/merchant";

export default async function ClientesPage() {
  const { customers } = await getCustomersPageData();

  const isEmpty = customers.length === 0;

  return (
    <>
      <AppPageIntro
        eyebrow="Clientes"
        title="Clientes"
        description={
          isEmpty
            ? "Aquí verás a los clientes que interactúan con tu negocio."
            : `${customers.length} clientes registrados.`
        }
      />

      {isEmpty ? (
        <section className="app-section">
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            <p className="text-sm text-muted">No hay clientes todavía</p>
            <p className="max-w-xs text-xs text-muted">
              Los clientes aparecerán aquí automáticamente cuando te escriban por WhatsApp.
            </p>
          </div>
        </section>
      ) : (
        <section className="app-section">
          <div className="app-card">
            <table className="site-table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>WhatsApp</th>
                  <th>Correo</th>
                  <th>Última actividad</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => (
                  <tr key={customer.id}>
                    <td className="font-semibold text-foreground">
                      {customer.full_name ?? "Sin nombre"}
                    </td>
                    <td className="text-sm text-muted">{customer.whatsapp_e164}</td>
                    <td className="text-sm text-muted">{customer.email ?? "—"}</td>
                    <td className="text-sm text-muted">
                      {formatDateTime(customer.last_seen_at)}
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

import { AppPageIntro } from "@/components/app-page-intro";
import { formatCurrency, formatDateTime } from "@/lib/format";
import {
  labelFulfillmentStatus,
  labelOrderPaymentStatus,
  labelOrderStatus,
} from "@/lib/labels";
import { getOrdersPageData } from "@/lib/merchant";

export default async function PedidosPage() {
  const { orders, orderItemsByOrder } = await getOrdersPageData();

  const isEmpty = orders.length === 0;

  return (
    <>
      <AppPageIntro
        eyebrow="Pedidos"
        title="Pedidos"
        description={
          isEmpty
            ? "Aquí aparecerán los pedidos de tus clientes."
            : `${orders.length} pedidos registrados.`
        }
      />

      {isEmpty ? (
        <section className="app-section">
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted">
              <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <path d="M16 10a4 4 0 0 1-8 0" />
            </svg>
            <p className="text-sm text-muted">No hay pedidos todavía</p>
            <p className="max-w-xs text-xs text-muted">
              Los pedidos aparecerán aquí automáticamente cuando tus clientes compren a través de WhatsApp.
            </p>
          </div>
        </section>
      ) : (
        <section className="app-section">
          <div className="app-card">
            <table className="site-table">
              <thead>
                <tr>
                  <th>Pedido</th>
                  <th>Cliente</th>
                  <th>Total</th>
                  <th>Estado</th>
                  <th>Pago</th>
                  <th>Entrega</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => {
                  const items = orderItemsByOrder[order.id] ?? [];

                  return (
                    <tr key={order.id}>
                      <td>
                        <p className="font-semibold text-foreground">
                          #{order.order_number}
                        </p>
                        <p className="mt-0.5 text-xs text-muted">
                          {formatDateTime(order.placed_at)}
                        </p>
                        {items.length > 0 && (
                          <p className="mt-1 text-xs text-muted">
                            {items.map((item) =>
                              `${item.quantity}× ${item.name}${item.variant_name ? ` (${item.variant_name})` : ""}`
                            ).join(", ")}
                          </p>
                        )}
                      </td>
                      <td>
                        <p className="text-sm text-foreground">
                          {order.customer?.full_name ?? "Sin nombre"}
                        </p>
                        {order.shipping_province && (
                          <p className="mt-0.5 text-xs text-muted">
                            {order.shipping_province}
                            {order.shipping_municipio ? `, ${order.shipping_municipio}` : ""}
                          </p>
                        )}
                      </td>
                      <td className="text-sm font-medium text-foreground">
                        {formatCurrency(order.total_amount, order.currency_code)}
                      </td>
                      <td>
                        <OrderPill status={labelOrderStatus(order.status)} />
                      </td>
                      <td>
                        <OrderPill status={labelOrderPaymentStatus(order.payment_status)} />
                      </td>
                      <td>
                        <OrderPill status={labelFulfillmentStatus(order.fulfillment_status)} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}

function OrderPill({ status }: { status: string }) {
  return (
    <span className="inline-block rounded-full bg-background px-2.5 py-1 text-xs font-medium text-muted">
      {status}
    </span>
  );
}

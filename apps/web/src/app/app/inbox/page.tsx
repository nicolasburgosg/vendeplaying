import Link from "next/link";
import { updateConversationAction } from "@/app/app/actions";
import { AppPageIntro } from "@/components/app-page-intro";
import {
  AttachOrderForm,
  ConversationReplyForm,
  CreateConversationOrderForm,
} from "@/components/inbox-forms";
import { ReadinessPanel } from "@/components/readiness-panel";
import { StatusPill } from "@/components/status-pill";
import {
  CONVERSATION_STATUS_OPTIONS,
  LEAD_TEMPERATURE_OPTIONS,
} from "@/lib/domain-options";
import { formatDateTime } from "@/lib/format";
import {
  labelConversationStatus,
  labelLeadTemperature,
  labelMessageStatus,
  labelOrderPaymentStatus,
  labelOrderStatus,
} from "@/lib/labels";
import { getInboxPageData } from "@/lib/merchant";

function conversationMode(aiPaused: boolean, handoffAt: string | null) {
  if (aiPaused) {
    return "Humano activo";
  }

  if (handoffAt) {
    return "Pidiendo humano";
  }

  return "IA activa";
}

export default async function InboxPage({
  searchParams,
}: {
  searchParams?: Promise<{ conversation?: string }>;
}) {
  const {
    context,
    conversations,
    messagesByConversation,
    statusEventsByMessage,
    linkedOrdersByConversation,
    ordersByCustomer,
    readiness,
  } =
    await getInboxPageData();
  const params = searchParams ? await searchParams : undefined;
  const selectedConversation =
    conversations.find((conversation) => conversation.id === params?.conversation) ??
    conversations[0] ??
    null;
  const selectedMessages = selectedConversation
    ? messagesByConversation[selectedConversation.id] ?? []
    : [];
  const linkedOrders = selectedConversation
    ? linkedOrdersByConversation[selectedConversation.id] ?? []
    : [];
  const customerOrders = selectedConversation?.customer
    ? ordersByCustomer[selectedConversation.customer.id] ?? []
    : [];
  const availableOrders = customerOrders.filter(
    (order) => order.conversation_id !== selectedConversation?.id,
  );

  return (
    <>
      <AppPageIntro
        eyebrow="Inbox"
        title="Conversaciones y takeover"
        description="Vista de inbox con estado comercial, takeover humano y trafico reciente sobre el canal principal."
        aside={<StatusPill tone="accent">{context.channel?.phone_e164 ?? "Sin numero"}</StatusPill>}
      />

      <section className="space-y-6">
        <div className="flex flex-col gap-4 border-t border-line pt-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <p className="site-kicker">Dependencias de envío</p>
            <p className="text-sm leading-7 text-muted">
              Estado del canal principal y módulos necesarios para responder
              desde el inbox.
            </p>
          </div>
          <ReadinessPanel readiness={readiness} compact />
        </div>

        {conversations.length > 0 ? (
          <table className="site-table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Estado</th>
                <th>Modo</th>
                <th>Lead</th>
                <th>Ultimo mensaje</th>
                <th>Detalle</th>
              </tr>
            </thead>
            <tbody>
              {conversations.map((conversation) => (
                <tr key={conversation.id}>
                  <td>
                    <Link
                      href={`/app/inbox?conversation=${conversation.id}`}
                      className="font-semibold text-foreground underline-offset-4 hover:underline"
                    >
                      {conversation.customer?.full_name ?? "Contacto sin nombre"}
                    </Link>
                    <p className="text-sm text-muted">
                      {conversation.customer?.whatsapp_e164 ?? "Sin telefono"}
                    </p>
                  </td>
                  <td className="text-sm text-muted">
                    {labelConversationStatus(conversation.status)}
                  </td>
                  <td className="text-sm text-muted">
                    {conversationMode(
                      conversation.ai_paused,
                      conversation.human_handoff_requested_at,
                    )}
                  </td>
                  <td className="text-sm text-muted">
                    {labelLeadTemperature(conversation.lead_temperature)}
                  </td>
                  <td className="text-sm text-muted">
                    {formatDateTime(conversation.last_message_at)}
                  </td>
                  <td className="text-sm text-muted">
                    <Link
                      href={`/app/inbox?conversation=${conversation.id}`}
                      className="font-semibold text-accent-strong"
                    >
                      Abrir
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="site-note">Aún no hay conversaciones para este negocio.</p>
        )}
      </section>

      <section className="border-t border-line pt-8">
        {selectedConversation ? (
          <div className="grid gap-8 xl:grid-cols-[0.7fr_1.3fr]">
            <div>
              <p className="site-kicker">Control operativo</p>
              <form action={updateConversationAction} className="mt-6 space-y-6 border-t border-line pt-6">
                <input
                  type="hidden"
                  name="conversationId"
                  value={selectedConversation.id}
                />
                <div className="grid gap-4">
                  <label className="grid gap-2 text-sm font-medium">
                    Estado
                    <select
                      name="status"
                      className="site-input"
                      defaultValue={selectedConversation.status}
                    >
                      {CONVERSATION_STATUS_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {labelConversationStatus(option)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-2 text-sm font-medium">
                    Temperatura del lead
                    <select
                      name="leadTemperature"
                      className="site-input"
                      defaultValue={selectedConversation.lead_temperature}
                    >
                      {LEAD_TEMPERATURE_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {labelLeadTemperature(option)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="inline-flex items-center gap-3 text-sm">
                    <input
                      type="checkbox"
                      name="aiPaused"
                      defaultChecked={selectedConversation.ai_paused}
                    />
                    Pausar IA y dejar takeover humano
                  </label>
                </div>

                <button type="submit" className="site-button">
                  Guardar conversación
                </button>
              </form>

              <div className="mt-8 space-y-8">
                <div>
                  <p className="site-kicker">Cobro y pedido</p>
                  <CreateConversationOrderForm conversationId={selectedConversation.id} />
                </div>

                <div>
                  <p className="site-kicker">Vincular pedido existente</p>
                  {availableOrders.length > 0 ? (
                    <AttachOrderForm
                      conversationId={selectedConversation.id}
                      orders={availableOrders.map((order) => ({
                        id: order.id,
                        label: `#${order.order_number} · ${labelOrderStatus(order.status)} · ${labelOrderPaymentStatus(order.payment_status)}`,
                      }))}
                    />
                  ) : (
                    <p className="site-note mt-4">
                      No hay pedidos adicionales de este cliente para vincular.
                    </p>
                  )}
                </div>

                <div>
                  <p className="site-kicker">Respuesta manual</p>
                  <ConversationReplyForm
                    conversationId={selectedConversation.id}
                    canSend={readiness.whatsapp.state === "ready"}
                    blockers={readiness.whatsapp.blockers}
                  />
                </div>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between gap-4 border-b border-line pb-3">
                <div>
                  <p className="font-semibold">
                    {selectedConversation.customer?.full_name ?? "Contacto sin nombre"}
                  </p>
                  <p className="text-sm text-muted">
                    {selectedConversation.customer?.whatsapp_e164 ?? "Sin telefono"}
                  </p>
                </div>
                <StatusPill tone={selectedConversation.ai_paused ? "warning" : "success"}>
                  {selectedConversation.ai_paused ? "Humano" : "IA"}
                </StatusPill>
              </div>

              {linkedOrders.length > 0 ? (
                <div className="border-b border-line py-4">
                  <p className="site-kicker">Pedidos vinculados</p>
                  <ul className="site-list mt-3 text-sm leading-7 text-muted">
                    {linkedOrders.map((order) => (
                      <li key={order.id}>
                        <span className="font-semibold text-foreground">
                          #{order.order_number}
                        </span>
                        {` · ${labelOrderStatus(order.status)} · ${labelOrderPaymentStatus(order.payment_status)}`}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {selectedMessages.length > 0 ? (
                <ul className="site-list mt-3 text-sm leading-7 text-muted">
                  {selectedMessages.slice().reverse().map((message) => (
                    <li key={message.id}>
                      <span className="font-semibold text-foreground">
                        {message.direction === "inbound" ? "Cliente" : "VendeTo"}
                      </span>
                      {`: ${message.body ?? message.message_type}`}
                      <p className="mt-1 text-xs uppercase tracking-[0.22em] text-muted">
                        {labelMessageStatus(message.current_status)}
                      </p>
                      {(statusEventsByMessage[message.id] ?? []).length > 0 ? (
                        <p className="mt-1 text-xs text-muted">
                          {(statusEventsByMessage[message.id] ?? [])
                            .slice(0, 2)
                            .map((event) => `${labelMessageStatus(event.canonical_status)} · ${formatDateTime(event.occurred_at)}`)
                            .join(" | ")}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="site-note mt-4">Aún no hay mensajes guardados en esta conversación.</p>
              )}
            </div>
          </div>
        ) : (
          <p className="site-note">Selecciona una conversación para verla en detalle.</p>
        )}
      </section>
    </>
  );
}

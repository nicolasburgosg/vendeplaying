import Link from "next/link";
import { Search } from "lucide-react";
import { ConversationReplyForm } from "@/components/inbox-forms";
import { InboxDetails } from "@/components/inbox-details";
import { StatusPill } from "@/components/status-pill";
import { formatDateTime } from "@/lib/format";
import {
  labelConversationStatus,
  labelMessageStatus,
} from "@/lib/labels";
import { getInboxPageData } from "@/lib/merchant";

function conversationMode(aiPaused: boolean, handoffAt: string | null) {
  if (aiPaused) return "Humano activo";
  if (handoffAt) return "Pidiendo humano";
  return "IA activa";
}

function timeAgo(dateStr: string | null) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return formatDateTime(dateStr);
}

function getInitials(name: string | null | undefined) {
  if (!name) return "?";
  return name
    .split(" ")
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function getLastMessagePreview(
  messages: { body: string | null; message_type: string; direction: string }[],
) {
  if (messages.length === 0) return "Sin mensajes";
  const last = messages[0];
  const prefix = last.direction === "inbound" ? "" : "Tú: ";
  const text = last.body ?? last.message_type;
  return `${prefix}${text}`;
}

export default async function InboxPage({
  searchParams,
}: {
  searchParams?: Promise<{ conversation?: string }>;
}) {
  const {
    conversations,
    messagesByConversation,
    statusEventsByMessage,
    linkedOrdersByConversation,
    ordersByCustomer,
    readiness,
  } = await getInboxPageData();

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
    <div className="-mx-8 -mt-8 flex h-[calc(100vh-0px)] lg:-mx-10 lg:-mt-10">
      <div className="flex w-[340px] shrink-0 flex-col border-r border-line bg-surface">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h1 className="text-lg font-semibold">Inbox</h1>
          <span className="tabular-nums text-sm text-muted">
            {conversations.length}
          </span>
        </div>

        <div className="border-b border-line px-4 py-3">
          <div className="flex items-center gap-2 rounded-lg bg-background px-3 py-2">
            <Search aria-hidden="true" size={15} className="shrink-0 text-muted" />
            <span className="text-sm text-muted">Buscar conversaciones&hellip;</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {conversations.length > 0 ? (
            <ul>
              {conversations.map((conversation) => {
                const isSelected = selectedConversation?.id === conversation.id;
                const msgs = messagesByConversation[conversation.id] ?? [];
                const preview = getLastMessagePreview(msgs);
                const initials = getInitials(conversation.customer?.full_name);

                return (
                  <li key={conversation.id}>
                    <Link
                      href={`/app/inbox?conversation=${conversation.id}`}
                      className={`flex items-start gap-3 border-b border-line px-5 py-3.5 transition-colors ${
                        isSelected ? "bg-accent-soft" : "hover:bg-background"
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-background text-xs font-semibold text-muted"
                      >
                        {initials}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="truncate text-sm font-semibold">
                            {conversation.customer?.full_name ?? "Sin nombre"}
                          </p>
                          <span className="shrink-0 text-xs tabular-nums text-muted">
                            {timeAgo(conversation.last_message_at)}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-muted">
                          {preview}
                        </p>
                        <div className="mt-1.5 flex items-center gap-2">
                          <StatusPill
                            tone={conversation.ai_paused ? "warning" : "success"}
                          >
                            {conversation.ai_paused ? "Humano" : "IA"}
                          </StatusPill>
                          <span className="text-xs text-muted">
                            {labelConversationStatus(conversation.status)}
                          </span>
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
              <p className="text-sm font-semibold">Sin conversaciones</p>
              <p className="mt-1 text-xs text-muted">
                Las conversaciones con clientes aparecerán aquí.
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col bg-background">
        {selectedConversation ? (
          <>
            <div className="flex items-center justify-between border-b border-line bg-surface px-6 py-4">
              <div className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-background text-xs font-semibold text-muted"
                >
                  {getInitials(selectedConversation.customer?.full_name)}
                </span>
                <div>
                  <p className="text-sm font-semibold">
                    {selectedConversation.customer?.full_name ?? "Sin nombre"}
                  </p>
                  <p className="text-xs text-muted">
                    {selectedConversation.customer?.whatsapp_e164 ?? "Sin teléfono"}
                  </p>
                </div>
              </div>
              <StatusPill
                tone={selectedConversation.ai_paused ? "warning" : "success"}
              >
                {conversationMode(
                  selectedConversation.ai_paused,
                  selectedConversation.human_handoff_requested_at,
                )}
              </StatusPill>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-6">
              {selectedMessages.length > 0 ? (
                <div className="mx-auto max-w-2xl space-y-3">
                  {selectedMessages
                    .slice()
                    .reverse()
                    .map((message) => {
                      const isOutbound = message.direction === "outbound";
                      const events = statusEventsByMessage[message.id] ?? [];

                      return (
                        <div
                          key={message.id}
                          className={`flex ${
                            isOutbound ? "justify-end" : "justify-start"
                          }`}
                        >
                          <div
                            className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                              isOutbound
                                ? "rounded-br-md bg-accent text-white"
                                : "rounded-bl-md bg-surface text-foreground"
                            }`}
                            style={
                              !isOutbound
                                ? { border: "1px solid var(--line)" }
                                : undefined
                            }
                          >
                            <p className="text-sm leading-relaxed">
                              {message.body ?? message.message_type}
                            </p>
                            <div
                              className={`mt-1 flex items-center gap-1.5 text-[0.65rem] ${
                                isOutbound ? "text-white/70" : "text-muted"
                              }`}
                            >
                              <span>{labelMessageStatus(message.current_status)}</span>
                              {events.length > 0 && (
                                <span>
                                  &middot; {formatDateTime(events[0].occurred_at)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              ) : (
                <div className="flex h-full flex-col items-center justify-center text-center">
                  <p className="text-sm font-semibold">Sin mensajes</p>
                  <p className="mt-1 text-xs text-muted">
                    Los mensajes de esta conversación aparecerán aquí.
                  </p>
                </div>
              )}
            </div>

            <div className="border-t border-line bg-surface px-6 py-4">
              <ConversationReplyForm
                conversationId={selectedConversation.id}
                canSend={readiness.whatsapp.state === "ready"}
                blockers={readiness.whatsapp.blockers}
              />
            </div>
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <p className="text-lg font-semibold">Selecciona una conversación</p>
            <p className="mt-1 text-sm text-muted">
              Elige una conversación de la lista para ver los mensajes.
            </p>
          </div>
        )}
      </div>

      {selectedConversation && (
        <InboxDetails
          conversation={selectedConversation}
          linkedOrders={linkedOrders}
          availableOrders={availableOrders}
        />
      )}
    </div>
  );
}

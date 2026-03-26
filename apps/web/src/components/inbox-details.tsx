"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { updateConversationAction } from "@/app/app/actions";
import {
  AttachOrderForm,
  CreateConversationOrderForm,
} from "@/components/inbox-forms";
import {
  CONVERSATION_STATUS_OPTIONS,
  LEAD_TEMPERATURE_OPTIONS,
} from "@/lib/domain-options";
import {
  labelConversationStatus,
  labelLeadTemperature,
  labelOrderPaymentStatus,
  labelOrderStatus,
} from "@/lib/labels";

type Order = {
  id: string;
  order_number: number;
  status: string;
  payment_status: string;
  conversation_id: string | null;
};

type Conversation = {
  id: string;
  status: string;
  lead_temperature: string;
  ai_paused: boolean;
  customer: { full_name: string | null; whatsapp_e164: string | null } | null;
};

function Section({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-line">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="group flex w-full items-center justify-between px-5 py-3 text-left text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-accent"
      >
        {title}
        <ChevronDown
          aria-hidden="true"
          size={14}
          className={`text-muted transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      <div
        className="grid transition-[grid-template-rows] duration-200 ease-out"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <div
            className={`px-5 pb-4 ${open ? "opacity-100" : "opacity-0"}`}
            style={{ transition: "opacity 200ms ease-out" }}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

export function InboxDetails({
  conversation,
  linkedOrders,
  availableOrders,
}: {
  conversation: Conversation;
  linkedOrders: Order[];
  availableOrders: Order[];
}) {
  return (
    <div className="hidden w-[280px] shrink-0 flex-col border-l border-line bg-surface xl:flex">
      <div className="border-b border-line px-5 py-4">
        <p className="text-sm font-semibold">
          {conversation.customer?.full_name ?? "Sin nombre"}
        </p>
        <p className="mt-0.5 text-xs text-muted">
          {conversation.customer?.whatsapp_e164 ?? "Sin teléfono"}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        <Section title="Control operativo" defaultOpen>
          <form action={updateConversationAction} className="space-y-3">
            <input type="hidden" name="conversationId" value={conversation.id} />
            <label className="grid gap-1 text-xs">
              Estado
              <select
                name="status"
                className="site-input text-sm"
                defaultValue={conversation.status}
              >
                {CONVERSATION_STATUS_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {labelConversationStatus(option)}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs">
              Temperatura
              <select
                name="leadTemperature"
                className="site-input text-sm"
                defaultValue={conversation.lead_temperature}
              >
                {LEAD_TEMPERATURE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {labelLeadTemperature(option)}
                  </option>
                ))}
              </select>
            </label>
            <label className="inline-flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                name="aiPaused"
                defaultChecked={conversation.ai_paused}
              />
              Takeover humano
            </label>
            <button type="submit" className="site-button w-full text-xs">
              Guardar
            </button>
          </form>
        </Section>

        {linkedOrders.length > 0 && (
          <Section title={`Pedidos vinculados (${linkedOrders.length})`} defaultOpen>
            <ul className="space-y-2">
              {linkedOrders.map((order) => (
                <li key={order.id} className="text-xs text-muted">
                  <span className="font-semibold text-foreground">
                    #{order.order_number}
                  </span>{" "}
                  &middot; {labelOrderStatus(order.status)} &middot;{" "}
                  {labelOrderPaymentStatus(order.payment_status)}
                </li>
              ))}
            </ul>
          </Section>
        )}

        <Section title="Crear pedido">
          <CreateConversationOrderForm conversationId={conversation.id} />
        </Section>

        {availableOrders.length > 0 && (
          <Section title="Vincular pedido">
            <AttachOrderForm
              conversationId={conversation.id}
              orders={availableOrders.map((order) => ({
                id: order.id,
                label: `#${order.order_number} · ${labelOrderStatus(order.status)} · ${labelOrderPaymentStatus(order.payment_status)}`,
              }))}
            />
          </Section>
        )}
      </div>
    </div>
  );
}

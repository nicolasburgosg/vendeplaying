"use client";

import { useActionState } from "react";
import {
  attachOrderToConversationAction,
  createConversationOrderAction,
  queueConversationReplyAction,
} from "@/app/app/actions";
import { FormStateMessage } from "@/components/form-state-message";
import { FormSubmitButton } from "@/components/form-submit-button";
import { INITIAL_APP_FORM_STATE } from "@/lib/form-state";

type Option = {
  id: string;
  label: string;
};

export function ConversationReplyForm({
  conversationId,
  canSend,
  blockers,
}: {
  conversationId: string;
  canSend: boolean;
  blockers: string[];
}) {
  const [state, formAction] = useActionState(
    queueConversationReplyAction,
    INITIAL_APP_FORM_STATE,
  );

  return (
    <form action={formAction} className="space-y-4 border-t border-line pt-6">
      <input type="hidden" name="conversationId" value={conversationId} />
      <label className="grid gap-2 text-sm font-medium">
        Respuesta manual
        <textarea
          name="body"
          className="site-textarea"
          placeholder="Escribe la respuesta que quieres enviar por WhatsApp."
          disabled={!canSend}
          required
        />
      </label>

      {!canSend ? (
        <ul className="site-list text-sm leading-7 text-muted">
          {blockers.map((blocker) => (
            <li key={blocker}>{blocker}</li>
          ))}
        </ul>
      ) : null}

      <FormStateMessage state={state} />
      <FormSubmitButton
        pendingLabel="Encolando respuesta..."
        disabled={!canSend}
      >
        Enviar por WhatsApp
      </FormSubmitButton>
    </form>
  );
}

export function AttachOrderForm({
  conversationId,
  orders,
}: {
  conversationId: string;
  orders: Option[];
}) {
  const [state, formAction] = useActionState(
    attachOrderToConversationAction,
    INITIAL_APP_FORM_STATE,
  );

  return (
    <form action={formAction} className="space-y-4 border-t border-line pt-6">
      <input type="hidden" name="conversationId" value={conversationId} />
      <label className="grid gap-2 text-sm font-medium">
        Vincular pedido existente
        <select
          name="orderId"
          className="site-input"
          defaultValue=""
          required
        >
          <option value="" disabled>
            Selecciona un pedido
          </option>
          {orders.map((order) => (
            <option key={order.id} value={order.id}>
              {order.label}
            </option>
          ))}
        </select>
      </label>

      <FormStateMessage state={state} />
      <FormSubmitButton pendingLabel="Vinculando pedido...">
        Vincular pedido
      </FormSubmitButton>
    </form>
  );
}

export function CreateConversationOrderForm({
  conversationId,
}: {
  conversationId: string;
}) {
  const [state, formAction] = useActionState(
    createConversationOrderAction,
    INITIAL_APP_FORM_STATE,
  );

  return (
    <form action={formAction} className="space-y-4 border-t border-line pt-6">
      <input type="hidden" name="conversationId" value={conversationId} />
      <div className="grid gap-4 lg:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium">
          Subtotal
          <input
            name="subtotal"
            type="number"
            min="0"
            step="0.01"
            className="site-input"
            required
          />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Envío
          <input
            name="shippingFee"
            type="number"
            min="0"
            step="0.01"
            className="site-input"
            defaultValue="0"
          />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Descuento
          <input
            name="discountTotal"
            type="number"
            min="0"
            step="0.01"
            className="site-input"
            defaultValue="0"
          />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Moneda
          <input name="currencyCode" className="site-input" defaultValue="DOP" />
        </label>
      </div>

      <label className="grid gap-2 text-sm font-medium">
        Notas operativas
        <textarea
          name="deliveryNotes"
          className="site-textarea"
          placeholder="Detalle breve para el equipo."
        />
      </label>

      <FormStateMessage state={state} />
      <FormSubmitButton pendingLabel="Creando pedido...">
        Crear pedido desde esta conversación
      </FormSubmitButton>
    </form>
  );
}

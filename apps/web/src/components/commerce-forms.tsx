"use client";

import { useActionState } from "react";
import {
  saveCustomerAction,
  saveFollowUpRuleAction,
  saveOrderItemAction,
  saveOrderAction,
  savePaymentConfigAction,
} from "@/app/app/actions";
import { FormStateMessage } from "@/components/form-state-message";
import { FormSubmitButton } from "@/components/form-submit-button";
import {
  FOLLOW_UP_SEND_MODE_OPTIONS,
  FOLLOW_UP_TARGET_OPTIONS,
  FOLLOW_UP_TRIGGER_OPTIONS,
  LEAD_TEMPERATURE_OPTIONS,
  ORDER_FULFILLMENT_STATUS_OPTIONS,
  ORDER_PAYMENT_STATUS_OPTIONS,
  ORDER_STATUS_OPTIONS,
} from "@/lib/domain-options";
import { INITIAL_APP_FORM_STATE } from "@/lib/form-state";
import {
  labelCaptureMode,
  labelFollowUpSendMode,
  labelFollowUpTarget,
  labelFollowUpTrigger,
  labelFulfillmentStatus,
  labelLeadTemperature,
  labelOrderPaymentStatus,
  labelOrderStatus,
  labelPaymentMethod,
  labelPaymentProvider,
} from "@/lib/labels";

type Option = {
  id: string;
  name: string;
};

type ProductOption = {
  id: string;
  name: string;
  price: number;
  currencyCode: string;
};

type VariantOption = {
  id: string;
  name: string;
};

type CodeOption = {
  code: string;
  display_name: string;
};

export function CustomerForm() {
  const [state, formAction] = useActionState(
    saveCustomerAction,
    INITIAL_APP_FORM_STATE,
  );

  return (
    <form action={formAction} className="space-y-6 border-t border-line pt-6">
      <div className="grid gap-4 lg:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium">
          Nombre completo
          <input name="fullName" className="site-input" />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          WhatsApp
          <input
            name="whatsapp"
            className="site-input"
            placeholder="+18095551234"
            required
          />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Correo
          <input name="email" type="email" className="site-input" />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Temperatura
          <select name="leadTemperature" className="site-input" defaultValue="cold">
            {LEAD_TEMPERATURE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {labelLeadTemperature(option)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Idioma preferido
          <input
            name="preferredLanguage"
            className="site-input"
            defaultValue="es-DO"
          />
        </label>
      </div>

      <label className="grid gap-2 text-sm font-medium">
        Notas
        <textarea name="notes" className="site-textarea" />
      </label>

      <FormStateMessage state={state} />
      <FormSubmitButton pendingLabel="Guardando cliente...">
        Guardar cliente
      </FormSubmitButton>
    </form>
  );
}

export function OrderForm({ customers }: { customers: Option[] }) {
  const [state, formAction] = useActionState(
    saveOrderAction,
    INITIAL_APP_FORM_STATE,
  );

  return (
    <form action={formAction} className="space-y-6 border-t border-line pt-6">
      <div className="grid gap-4 lg:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium">
          Cliente
          <select name="customerId" className="site-input" defaultValue="" required>
            <option value="" disabled>
              Selecciona un cliente
            </option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Moneda
          <input name="currencyCode" className="site-input" defaultValue="DOP" />
        </label>
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
          Estado
          <select name="status" className="site-input" defaultValue="awaiting_payment">
            {ORDER_STATUS_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {labelOrderStatus(option)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Estado de pago
          <select
            name="paymentStatus"
            className="site-input"
            defaultValue="pending"
          >
            {ORDER_PAYMENT_STATUS_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {labelOrderPaymentStatus(option)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Fulfillment
          <select
            name="fulfillmentStatus"
            className="site-input"
            defaultValue="unfulfilled"
          >
            {ORDER_FULFILLMENT_STATUS_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {labelFulfillmentStatus(option)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium">
          Nombre de entrega
          <input name="shippingName" className="site-input" />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Teléfono de entrega
          <input name="shippingPhone" className="site-input" />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Provincia
          <input name="shippingProvince" className="site-input" />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Municipio
          <input name="shippingMunicipio" className="site-input" />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Sector
          <input name="shippingSector" className="site-input" />
        </label>
      </div>

      <label className="grid gap-2 text-sm font-medium">
        Notas de entrega
        <textarea name="deliveryNotes" className="site-textarea" />
      </label>

      <FormStateMessage state={state} />
      <FormSubmitButton pendingLabel="Creando pedido...">
        Crear pedido
      </FormSubmitButton>
    </form>
  );
}

export function PaymentConfigForm({
  providers,
  methods,
  captureModes,
}: {
  providers: CodeOption[];
  methods: CodeOption[];
  captureModes: CodeOption[];
}) {
  const [state, formAction] = useActionState(
    savePaymentConfigAction,
    INITIAL_APP_FORM_STATE,
  );

  return (
    <form action={formAction} className="space-y-6 border-t border-line pt-6">
      <div className="grid gap-4 lg:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium">
          Proveedor
          <select name="providerCode" className="site-input" defaultValue="cardnet">
            {providers.map((option) => (
              <option key={option.code} value={option.code}>
                {labelPaymentProvider(option.code) || option.display_name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Método
          <select name="methodTypeCode" className="site-input">
            {methods.map((option) => (
              <option key={option.code} value={option.code}>
                {labelPaymentMethod(option.code) || option.display_name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Captura
          <select name="captureModeCode" className="site-input">
            {captureModes.map((option) => (
              <option key={option.code} value={option.code}>
                {labelCaptureMode(option.code) || option.display_name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Estado operativo
          <input
            className="site-input"
            value="La configuración sensible del proveedor se gestiona internamente."
            readOnly
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-6 text-sm">
        <label className="inline-flex items-center gap-3">
          <input type="checkbox" name="isEnabled" defaultChecked />
          Activa
        </label>
        <label className="inline-flex items-center gap-3">
          <input type="checkbox" name="isDefault" />
          Usar por defecto
        </label>
      </div>

      <FormStateMessage state={state} />
      <FormSubmitButton pendingLabel="Guardando configuración...">
        Guardar configuración de pago
      </FormSubmitButton>
    </form>
  );
}

export function OrderItemForm({
  orders,
  products,
  variantsByProduct,
}: {
  orders: Option[];
  products: ProductOption[];
  variantsByProduct: Record<string, VariantOption[]>;
}) {
  const [state, formAction] = useActionState(
    saveOrderItemAction,
    INITIAL_APP_FORM_STATE,
  );

  return (
    <form action={formAction} className="space-y-6 border-t border-line pt-6">
      <div className="grid gap-4 lg:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium">
          Pedido
          <select name="orderId" className="site-input" defaultValue="" required>
            <option value="" disabled>
              Selecciona un pedido
            </option>
            {orders.map((order) => (
              <option key={order.id} value={order.id}>
                {order.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Producto
          <select name="productId" className="site-input" defaultValue="">
            <option value="">Línea manual</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Variante
          <select name="variantId" className="site-input" defaultValue="">
            <option value="">Sin variante</option>
            {Object.entries(variantsByProduct).flatMap(([productId, variants]) =>
              variants.map((variant) => (
                <option key={variant.id} value={variant.id}>
                  {products.find((product) => product.id === productId)?.name ?? "Producto"} · {variant.name}
                </option>
              )),
            )}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Cantidad
          <input
            name="quantity"
            type="number"
            min="1"
            step="1"
            className="site-input"
            defaultValue="1"
            required
          />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Nombre manual
          <input
            name="name"
            className="site-input"
            placeholder="Solo si la línea no viene del catálogo"
          />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Precio unitario manual
          <input
            name="unitPrice"
            type="number"
            min="0"
            step="0.01"
            className="site-input"
          />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Moneda
          <input
            name="currencyCode"
            className="site-input"
            defaultValue="DOP"
          />
        </label>
      </div>

      <FormStateMessage state={state} />
      <FormSubmitButton pendingLabel="Agregando línea...">
        Agregar línea
      </FormSubmitButton>
    </form>
  );
}

export function FollowUpRuleForm({
  templates,
}: {
  templates: Option[];
}) {
  const [state, formAction] = useActionState(
    saveFollowUpRuleAction,
    INITIAL_APP_FORM_STATE,
  );

  return (
    <form action={formAction} className="space-y-6 border-t border-line pt-6">
      <div className="grid gap-4 lg:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium">
          Nombre
          <input name="name" className="site-input" required />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Disparador
          <select name="triggerType" className="site-input" defaultValue="payment_reminder">
            {FOLLOW_UP_TRIGGER_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {labelFollowUpTrigger(option)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Objetivo
          <select name="targetType" className="site-input" defaultValue="conversation">
            {FOLLOW_UP_TARGET_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {labelFollowUpTarget(option)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Modo de envío
          <select
            name="sendMode"
            className="site-input"
            defaultValue="in_session_freeform"
          >
            {FOLLOW_UP_SEND_MODE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {labelFollowUpSendMode(option)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Delay en minutos
          <input
            name="delayMinutes"
            type="number"
            min="0"
            step="1"
            className="site-input"
            defaultValue="30"
          />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Máximo de ejecuciones
          <input
            name="maxExecutions"
            type="number"
            min="1"
            step="1"
            className="site-input"
            defaultValue="1"
          />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Plantilla de WhatsApp
          <select name="templateId" className="site-input" defaultValue="">
            <option value="">Sin plantilla</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="grid gap-2 text-sm font-medium">
        Mensaje libre
        <textarea name="freeformBody" className="site-textarea" />
      </label>

      <div className="grid gap-3 text-sm">
        <p className="font-medium">Detener esta regla cuando:</p>
        <label className="inline-flex items-center gap-3">
          <input type="checkbox" name="stopOnReply" defaultChecked />
          El cliente responda
        </label>
        <label className="inline-flex items-center gap-3">
          <input type="checkbox" name="stopOnPayment" defaultChecked />
          El pedido quede pagado
        </label>
        <label className="inline-flex items-center gap-3">
          <input type="checkbox" name="stopOnHumanTakeover" defaultChecked />
          El equipo tome control humano
        </label>
      </div>

      <label className="inline-flex items-center gap-3 text-sm">
        <input type="checkbox" name="isActive" defaultChecked />
        Regla activa
      </label>

      <FormStateMessage state={state} />
      <FormSubmitButton pendingLabel="Guardando regla...">
        Guardar regla
      </FormSubmitButton>
    </form>
  );
}

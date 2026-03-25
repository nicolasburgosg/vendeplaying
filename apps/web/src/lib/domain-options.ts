export const TONE_OPTIONS = [
  "cercano",
  "profesional",
  "divertido",
  "directo",
] as const;

export const SALES_STYLE_OPTIONS = [
  "consultative",
  "educational",
  "emotional",
  "balanced",
] as const;

export const MESSAGE_LENGTH_OPTIONS = ["short", "medium", "long"] as const;

export const LEAD_TEMPERATURE_OPTIONS = ["cold", "warm", "hot"] as const;

export const CONVERSATION_STATUS_OPTIONS = [
  "open",
  "waiting_customer",
  "waiting_human",
  "awaiting_payment",
  "paid",
  "closed",
  "lost",
] as const;

export const PRODUCT_STATUS_OPTIONS = [
  "draft",
  "active",
  "archived",
] as const;

export const KNOWLEDGE_KIND_OPTIONS = [
  "faq",
  "policy",
  "campaign",
  "product_note",
] as const;

export const KNOWLEDGE_CATEGORY_OPTIONS = [
  "products",
  "hours",
  "shipping",
  "payments",
  "returns",
  "promotions",
  "general",
] as const;

export const ORDER_STATUS_OPTIONS = [
  "draft",
  "quoted",
  "awaiting_shipping",
  "awaiting_payment",
  "paid",
  "preparing",
  "delivered",
  "closed",
  "cancelled",
  "lost",
] as const;

export const ORDER_PAYMENT_STATUS_OPTIONS = [
  "unpaid",
  "pending",
  "paid",
  "failed",
  "refunded",
  "partially_refunded",
  "cancelled",
] as const;

export const ORDER_FULFILLMENT_STATUS_OPTIONS = [
  "unfulfilled",
  "preparing",
  "ready",
  "shipped",
  "delivered",
  "cancelled",
] as const;

export const FOLLOW_UP_TRIGGER_OPTIONS = [
  "abandoned_cart",
  "payment_reminder",
  "awaiting_customer",
  "order_status_update",
  "manual",
] as const;

export const FOLLOW_UP_TARGET_OPTIONS = [
  "conversation",
  "order",
  "customer",
] as const;

export const FOLLOW_UP_SEND_MODE_OPTIONS = [
  "in_session_freeform",
  "template",
] as const;

export const TEMPLATE_CATEGORY_OPTIONS = [
  "utility",
  "marketing",
  "authentication",
] as const;

export const TEMPLATE_STATUS_OPTIONS = [
  "approved",
  "pending",
  "paused",
  "disabled",
] as const;

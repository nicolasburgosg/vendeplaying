const LABELS = {
  tone: {
    cercano: "Cercano",
    profesional: "Profesional",
    divertido: "Divertido",
    directo: "Directo",
  },
  salesStyle: {
    consultative: "Asesor",
    educational: "Informativo",
    emotional: "Cercano",
    balanced: "Natural",
  },
  messageLength: {
    short: "Corta",
    medium: "Media",
    long: "Larga",
  },
  leadTemperature: {
    cold: "Frío",
    warm: "Tibio",
    hot: "Caliente",
  },
  conversationStatus: {
    open: "Abierta",
    waiting_customer: "Esperando cliente",
    waiting_human: "Esperando humano",
    awaiting_payment: "Pendiente de pago",
    paid: "Pagada",
    closed: "Cerrada",
    lost: "Pérdida",
  },
  messageStatus: {
    queued: "En cola",
    accepted: "Aceptado",
    sent: "Enviado",
    delivered: "Entregado",
    read: "Leído",
    failed: "Fallido",
    received: "Recibido",
  },
  productStatus: {
    draft: "Borrador",
    active: "Activa",
    archived: "Archivada",
  },
  productSource: {
    manual: "Manual",
    csv: "CSV",
    website_sync: "Sincronización web",
    pdf_import: "Importación PDF",
    api: "API",
  },
  knowledgeKind: {
    faq: "FAQ",
    policy: "Política",
    campaign: "Campaña",
    product_note: "Nota de producto",
  },
  knowledgeCategory: {
    products: "Productos",
    hours: "Horarios",
    shipping: "Envíos",
    payments: "Pagos",
    returns: "Devoluciones",
    promotions: "Promociones",
    general: "General",
  },
  orderStatus: {
    draft: "Borrador",
    quoted: "Cotizado",
    awaiting_shipping: "Pendiente de envío",
    awaiting_payment: "Pendiente de pago",
    paid: "Pagado",
    preparing: "Preparando",
    delivered: "Entregado",
    closed: "Cerrado",
    cancelled: "Cancelado",
    lost: "Perdido",
  },
  orderPaymentStatus: {
    unpaid: "Sin cobrar",
    pending: "Pendiente",
    paid: "Pagado",
    failed: "Fallido",
    refunded: "Reembolsado",
    partially_refunded: "Reembolso parcial",
    cancelled: "Cancelado",
  },
  fulfillmentStatus: {
    unfulfilled: "Sin preparar",
    preparing: "Preparando",
    ready: "Listo",
    shipped: "En ruta",
    delivered: "Entregado",
    cancelled: "Cancelado",
  },
  followUpTrigger: {
    abandoned_cart: "Carrito abandonado",
    payment_reminder: "Recordatorio de pago",
    awaiting_customer: "Cliente sin responder",
    order_status_update: "Cambio de estado del pedido",
    manual: "Manual",
  },
  followUpTarget: {
    conversation: "Conversación",
    order: "Pedido",
    customer: "Cliente",
  },
  followUpSendMode: {
    in_session_freeform: "Mensaje libre en sesión",
    template: "Plantilla aprobada",
  },
  templateCategory: {
    utility: "Utilidad",
    marketing: "Marketing",
    authentication: "Autenticación",
  },
  templateStatus: {
    approved: "Aprobada",
    pending: "Pendiente",
    paused: "Pausada",
    disabled: "Deshabilitada",
  },
  templateQuality: {
    high: "Alta",
    medium: "Media",
    low: "Baja",
    green: "Alta",
    yellow: "Media",
    red: "Baja",
    unknown: "Sin dato",
  },
  paymentProvider: {
    cardnet: "CardNET",
    azul: "Azul",
    paypal: "PayPal",
    bank_transfer: "Transferencia bancaria",
    cash_on_delivery: "Pago contra entrega",
    manual: "Manual",
  },
  paymentMethod: {
    card_redirect: "Tarjeta por enlace",
    card_embedded: "Tarjeta embebida",
    wallet_redirect: "Billetera digital",
    payment_link: "Link de pago",
    cardnet_button: "Botón CardNET",
    cardnet_link: "Enlace CardNET",
    bank_transfer: "Transferencia bancaria",
    cash_on_delivery: "Pago contra entrega",
    manual: "Manual",
  },
  captureMode: {
    sale: "Cobro inmediato",
    authorize_capture: "Autorizar y capturar",
  },
  paymentAttemptStatus: {
    pending: "Pendiente",
    requires_action: "Requiere acción",
    authorized: "Autorizado",
    paid: "Pagado",
    failed: "Fallido",
    cancelled: "Cancelado",
    expired: "Expirado",
    refunded: "Reembolsado",
    succeeded: "Exitoso",
    created: "Creado",
  },
  paymentEvent: {
    checkout_created: "Checkout creado",
    webhook_authorized: "Autorización recibida",
    webhook_paid: "Pago confirmado",
    webhook_failed: "Pago fallido",
    expired: "Intento expirado",
    refund_recorded: "Reembolso registrado",
    reconciled: "Reconciliado",
  },
  channelStatus: {
    pending_verification: "Pendiente de conexión",
    connected: "Conectado",
    disconnected: "Desconectado",
    paused: "Pausado",
    error: "Con error",
  },
  qualityRating: {
    green: "Alta",
    yellow: "Media",
    red: "Baja",
    unknown: "Sin dato",
    high: "Alta",
    medium: "Media",
    low: "Baja",
  },
  membershipRole: {
    owner: "Propietario",
    admin: "Administrador",
    operator: "Operador",
    analyst: "Analista",
    read_only: "Solo lectura",
  },
  importJobStatus: {
    queued: "En cola",
    running: "Procesando",
    succeeded: "Completada",
    partially_succeeded: "Completada con observaciones",
    failed: "Fallida",
    cancelled: "Cancelada",
  },
  jobType: {
    send_whatsapp_message: "Envío de WhatsApp",
    run_follow_up: "Seguimiento automático",
    payment_reconcile: "Reconciliación de pago",
    refresh_catalog: "Importación de catálogo",
    recalc_lead_score: "Recalcular lead",
    generic: "Tarea interna",
  },
  jobStatus: {
    queued: "En cola",
    locked: "En proceso",
    succeeded: "Completado",
    failed: "Fallido",
    cancelled: "Cancelado",
    dead_letter: "Bloqueado para revisión",
  },
} as const;

function humanize(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\p{L}/u, (match) => match.toUpperCase());
}

function fromMap(
  group: Record<string, string>,
  value?: string | null,
  fallback = "Sin definir",
) {
  if (!value) {
    return fallback;
  }

  return group[value] ?? humanize(value);
}

export function labelTone(value?: string | null) {
  return fromMap(LABELS.tone, value);
}

export function labelSalesStyle(value?: string | null) {
  return fromMap(LABELS.salesStyle, value);
}

export function labelMessageLength(value?: string | null) {
  return fromMap(LABELS.messageLength, value);
}

export function labelLeadTemperature(value?: string | null) {
  return fromMap(LABELS.leadTemperature, value);
}

export function labelConversationStatus(value?: string | null) {
  return fromMap(LABELS.conversationStatus, value);
}

export function labelProductStatus(value?: string | null) {
  return fromMap(LABELS.productStatus, value);
}

export function labelMessageStatus(value?: string | null) {
  return fromMap(LABELS.messageStatus, value);
}

export function labelProductSource(value?: string | null) {
  return fromMap(LABELS.productSource, value);
}

export function labelKnowledgeKind(value?: string | null) {
  return fromMap(LABELS.knowledgeKind, value);
}

export function labelKnowledgeCategory(value?: string | null) {
  return fromMap(LABELS.knowledgeCategory, value);
}

export function labelOrderStatus(value?: string | null) {
  return fromMap(LABELS.orderStatus, value);
}

export function labelOrderPaymentStatus(value?: string | null) {
  return fromMap(LABELS.orderPaymentStatus, value);
}

export function labelFulfillmentStatus(value?: string | null) {
  return fromMap(LABELS.fulfillmentStatus, value);
}

export function labelFollowUpTrigger(value?: string | null) {
  return fromMap(LABELS.followUpTrigger, value);
}

export function labelFollowUpTarget(value?: string | null) {
  return fromMap(LABELS.followUpTarget, value);
}

export function labelFollowUpSendMode(value?: string | null) {
  return fromMap(LABELS.followUpSendMode, value);
}

export function labelTemplateCategory(value?: string | null) {
  return fromMap(LABELS.templateCategory, value);
}

export function labelTemplateStatus(value?: string | null) {
  return fromMap(LABELS.templateStatus, value);
}

export function labelTemplateQuality(value?: string | null) {
  return fromMap(LABELS.templateQuality, value, "Sin dato");
}

export function labelPaymentProvider(value?: string | null) {
  return fromMap(LABELS.paymentProvider, value);
}

export function labelPaymentMethod(value?: string | null) {
  return fromMap(LABELS.paymentMethod, value);
}

export function labelCaptureMode(value?: string | null) {
  return fromMap(LABELS.captureMode, value);
}

export function labelPaymentAttemptStatus(value?: string | null) {
  return fromMap(LABELS.paymentAttemptStatus, value);
}

export function labelPaymentEvent(value?: string | null) {
  return fromMap(LABELS.paymentEvent, value);
}

export function labelChannelStatus(value?: string | null) {
  return fromMap(LABELS.channelStatus, value);
}

export function labelQualityRating(value?: string | null) {
  return fromMap(LABELS.qualityRating, value, "Sin dato");
}

export function labelMembershipRole(value?: string | null) {
  return fromMap(LABELS.membershipRole, value);
}

export function labelImportJobStatus(value?: string | null) {
  return fromMap(LABELS.importJobStatus, value);
}

export function labelJobType(value?: string | null) {
  return fromMap(LABELS.jobType, value);
}

export function labelJobStatus(value?: string | null) {
  return fromMap(LABELS.jobStatus, value);
}

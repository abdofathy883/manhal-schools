/** One warehouse item taken from (or missing in) stock for a request line. */
export interface IssueLine {
  itemId: string;
  code: string;
  nameAr: string;
  unitAr: string;
  qty: number;
  /** Stock unit price (SAR) at the time of the plan. */
  unitPrice: number;
}

/** Result of checking a request's item lines against live stock. A line is issued whole or not at all. */
export interface FulfilmentPlan {
  issued: IssueLine[];
  shortages: IssueLine[];
}

/** Stock handling of a request (kept in `details.fulfilment`): what was issued and what is awaiting a purchase. */
export interface Fulfilment {
  issued: IssueLine[];
  awaiting: IssueLine[];
  /** Linked purchase request that will replenish the awaiting lines. */
  purchaseRef?: string;
}

export const FULFILMENT_KEY = 'fulfilment';
/** Marks a purchase request that replenishes stock for lines of another request (`details.forLines`). */
export const FOR_LINES_KEY = 'forLines';

export interface Quote {
  id: string;
  supplierId: string;
  supplierName: string;
  amount: number;
  deliveryDays: number;
  noteAr?: string;
}

export interface PurchaseOrder {
  no: string;
  supplierId: string;
  supplierName: string;
  amount: number;
  quoteId?: string;
  issuedAt: string;
  byName: string;
}

export type ReceiptCondition = 'complete' | 'with_notes';

export const RECEIPT_CONDITION_LABELS: Record<ReceiptCondition, string> = {
  complete: 'مستلم كاملًا وسليمًا',
  with_notes: 'مستلم مع ملاحظات',
};

/** Goods receipt and custody acknowledgement, recorded by the receiver. */
export interface Receipt {
  receivedAt: string;
  receiverId: string;
  receiverName: string;
  condition: ReceiptCondition;
  custodyAck: boolean;
  noteAr?: string;
}

/** Procurement data of a purchase request (`details.procurement`); executor and finance only. */
export interface ProcurementData {
  quotes?: Quote[];
  selectedQuoteId?: string;
  po?: PurchaseOrder;
  receipt?: Receipt;
}

export const PROCUREMENT_KEY = 'procurement';

export type StockMovementKind = 'in' | 'issue' | 'adjust';

export const STOCK_KIND_LABELS: Record<StockMovementKind, string> = {
  in: 'إدخال',
  issue: 'صرف',
  adjust: 'تسوية جرد',
};

export interface StockMovement {
  id: string;
  itemId: string;
  kind: StockMovementKind;
  /** Signed change: positive adds stock, negative removes it. */
  delta: number;
  at: string;
  byId: string | null;
  byName: string;
  /** Request the movement belongs to (issues, receipts). */
  requestId?: string;
  requestRef?: string;
  noteAr?: string;
}

export interface StockChange {
  itemId: string;
  kind: StockMovementKind;
  delta: number;
  requestId?: string;
  requestRef?: string;
  noteAr?: string;
}

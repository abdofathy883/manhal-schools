import { WarehouseItem } from '../models/reference';
import { FulfilmentPlan, IssueLine } from '../models/procurement';
import { ServiceRequest } from '../models/request';
import { RequestDraft } from '../workflows/engine';

export interface ItemQty {
  itemId: string;
  qty: number;
}

const lineOf = (item: WarehouseItem, qty: number): IssueLine => ({
  itemId: item.id,
  code: item.code,
  nameAr: item.nameAr,
  unitAr: item.unitAr,
  qty,
  unitPrice: item.unitPrice,
});

/**
 * Checks item lines against stock. A line is issued whole when the stock covers it, otherwise it is a shortage
 * (no partial issue), and repeated items are merged first.
 */
export function planFulfilment(items: readonly WarehouseItem[], lines: readonly ItemQty[]): FulfilmentPlan {
  const merged = new Map<string, number>();
  for (const l of lines) merged.set(l.itemId, (merged.get(l.itemId) ?? 0) + Number(l.qty));
  const plan: FulfilmentPlan = { issued: [], shortages: [] };
  for (const [itemId, qty] of merged) {
    const item = items.find((i) => i.id === itemId);
    if (!item || !(qty > 0)) continue;
    (item.stock >= qty ? plan.issued : plan.shortages).push(lineOf(item, qty));
  }
  return plan;
}

export type StockLevel = 'out' | 'low' | 'ok';

export function stockLevel(item: Pick<WarehouseItem, 'stock' | 'reorderLevel'>): StockLevel {
  return item.stock <= 0 ? 'out' : item.stock <= item.reorderLevel ? 'low' : 'ok';
}

export const totalOf = (lines: readonly IssueLine[]): number => lines.reduce((sum, l) => sum + l.qty * l.unitPrice, 0);

/** The purchase request raised for lines the warehouse cannot cover; it replenishes stock and resumes the parent when received. */
export function buildReplenishmentDraft(parent: ServiceRequest, shortages: readonly IssueLine[]): RequestDraft {
  const forWhat = parent.service === 'warehouse-need' ? 'احتياج مستودع' : 'قطع غيار';
  return {
    service: 'purchase-request',
    titleAr: `طلب شراء مرتبط: ${forWhat} — ${parent.titleAr}`,
    descriptionAr: `شراء الأصناف غير المتوفرة في المستودع لاستكمال الطلب ${parent.refNo}. عند الاستلام يُصرف الصنف للطلب الأصلي ويعود للتنفيذ تلقائيًا.`,
    priority: parent.priority === 'preventive' ? 'normal' : parent.priority,
    branchId: parent.branchId,
    departmentId: parent.departmentId,
    attachments: [],
    estimatedValue: totalOf(shortages),
    details: {
      requestingParty: 'الصيانة والمستودع المركزي',
      deliveryLocation: 'المستودع المركزي',
      justification: `الصنف غير متوفر في المستودع لطلب ${parent.refNo}.`,
      delayImpact: 'توقف الطلب الأصلي (معلّق: بانتظار قطع).',
      parentRef: parent.refNo,
      items: shortages.map((l) => ({ description: `${l.nameAr} (${l.code})`, unit: l.unitAr, qty: l.qty, price: l.unitPrice, notes: '' })),
      forLines: shortages,
    },
  };
}

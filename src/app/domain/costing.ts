import { FOR_LINES_KEY } from './models/procurement';
import { CostLine, ServiceRequest } from './models/request';

export interface CostBreakdown {
  parts: number;
  labour: number;
  purchase: number;
  other: number;
  total: number;
}

const lineTotal = (c: CostLine): number => c.quantity * c.unitCost;

export const EMPTY_BREAKDOWN: CostBreakdown = { parts: 0, labour: 0, purchase: 0, other: 0, total: 0 };

/** Purchase requests that restock the warehouse for another request: the stock issue carries that cost, not the purchase. */
export const isReplenishment = (r: ServiceRequest): boolean => !!r.details[FOR_LINES_KEY];

export function breakdown(costs: readonly CostLine[]): CostBreakdown {
  const out = { ...EMPTY_BREAKDOWN };
  for (const c of costs) {
    const v = lineTotal(c);
    if (c.kind === 'part') out.parts += v;
    else if (c.kind === 'labour') out.labour += v;
    else if (c.kind === 'purchase') out.purchase += v;
    else out.other += v;
    out.total += v;
  }
  return out;
}

/** Cost that counts towards a branch, department or vehicle: replenishment purchases and dead requests are left out. */
export function operationalCost(r: ServiceRequest): number {
  if (isReplenishment(r) || r.status === 'rejected' || r.status === 'cancelled') return 0;
  return breakdown(r.costs).total;
}

export interface RollUp {
  total: number;
  requests: number;
}

/** Operational cost summed by `key` (requests with no key are skipped). */
export function rollUp(requests: readonly ServiceRequest[], key: (r: ServiceRequest) => string | null | undefined): Map<string, RollUp> {
  const map = new Map<string, RollUp>();
  for (const r of requests) {
    const k = key(r);
    const cost = operationalCost(r);
    if (!k || cost <= 0) continue;
    const entry = map.get(k) ?? { total: 0, requests: 0 };
    entry.total += cost;
    entry.requests += 1;
    map.set(k, entry);
  }
  return map;
}

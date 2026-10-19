import { ServiceKey, ServiceRequest } from '../../domain/models/request';

export const FLEET_SERVICES: readonly ServiceKey[] = ['vehicle-maintenance', 'traffic-violation', 'traffic-accident'];

const CLOSED_STATES: readonly string[] = ['closed', 'rejected', 'cancelled'];

export interface FleetTotals {
  maintenance: number;
  violations: number;
  accidents: number;
  open: number;
  /** Parts, labour and other costs recorded on maintenance requests. */
  maintenanceCost: number;
  /** Sum of traffic-violation fines. */
  fines: number;
  /** Cumulative cost = maintenance cost + fines. */
  total: number;
  /** Average fault share of the driver across accidents, or `null` when there are none. */
  avgFaultPercent: number | null;
}

export const costOf = (r: ServiceRequest): number => r.costs.reduce((sum, c) => sum + c.quantity * c.unitCost, 0);
export const fineOf = (r: ServiceRequest): number => (r.service === 'traffic-violation' ? Number(r.details['amount'] ?? 0) || 0 : 0);

export const isFleetRequest = (r: ServiceRequest): boolean => FLEET_SERVICES.includes(r.service);

export function forVehicle(requests: readonly ServiceRequest[], vehicleId: string): ServiceRequest[] {
  return requests.filter((r) => isFleetRequest(r) && r.details['vehicleId'] === vehicleId);
}

export function forDriver(requests: readonly ServiceRequest[], driverId: string): ServiceRequest[] {
  return requests.filter((r) => isFleetRequest(r) && r.details['driverId'] === driverId);
}

export function summarize(requests: readonly ServiceRequest[]): FleetTotals {
  const valid = requests.filter((r) => r.status !== 'rejected' && r.status !== 'cancelled');
  const maintenance = valid.filter((r) => r.service === 'vehicle-maintenance');
  const violations = valid.filter((r) => r.service === 'traffic-violation');
  const accidents = valid.filter((r) => r.service === 'traffic-accident');
  const maintenanceCost = maintenance.reduce((sum, r) => sum + costOf(r), 0);
  const fines = violations.reduce((sum, r) => sum + fineOf(r), 0);
  const percents = accidents.map((r) => Number(r.details['faultPercent'])).filter((n) => Number.isFinite(n));
  return {
    maintenance: maintenance.length,
    violations: violations.length,
    accidents: accidents.length,
    open: requests.filter((r) => !CLOSED_STATES.includes(r.status)).length,
    maintenanceCost,
    fines,
    total: maintenanceCost + fines,
    avgFaultPercent: percents.length ? Math.round(percents.reduce((a, b) => a + b, 0) / percents.length) : null,
  };
}

/** Ids of the `n` highest values (value must be positive), used for the "highest cost" / "most violations" highlights. */
export function topIds(entries: ReadonlyArray<{ id: string; value: number }>, n = 3, min = 1): Set<string> {
  return new Set(
    [...entries]
      .filter((e) => e.value >= min)
      .sort((a, b) => b.value - a.value)
      .slice(0, n)
      .map((e) => e.id),
  );
}

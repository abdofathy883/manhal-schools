import { ApprovalLimits } from '../models/platform';
import { ApprovalStep, ServiceRequest } from '../models/request';
import { ChainInput, WORKFLOWS } from './workflow-defs';

/** Builds the pending approval chain for a request value/priority. Empty = approved automatically. */
export function buildApprovalChain(input: ChainInput, limits: ApprovalLimits): ApprovalStep[] {
  return WORKFLOWS[input.service].approvals(input, limits).map((spec, i) => ({
    id: `ap-${i + 1}`,
    permissionKey: spec.permissionKey,
    labelAr: spec.labelAr,
    state: 'pending' as const,
  }));
}

/**
 * Recomputes the chain after the limits (or the request value) changed.
 * Steps that already have a decision are kept; remaining steps are rebuilt from the new rules.
 * A step that is no longer required becomes `skipped`.
 */
export function recomputeChain(request: ServiceRequest, limits: ApprovalLimits): ApprovalStep[] {
  const wanted = buildApprovalChain(
    {
      service: request.service,
      priority: request.priority,
      estimatedValue: request.estimatedValue,
      details: request.details,
    },
    limits,
  );
  const decided = request.approvals.filter((s) => s.state === 'approved' || s.state === 'rejected');
  const result: ApprovalStep[] = [...decided];
  for (const step of wanted) {
    if (!decided.some((d) => d.permissionKey === step.permissionKey)) result.push(step);
  }
  // Pending steps that the new rules no longer require are kept for the audit trail as `skipped`.
  for (const old of request.approvals) {
    const stillWanted = wanted.some((w) => w.permissionKey === old.permissionKey);
    if (old.state === 'pending' && !stillWanted) result.push({ ...old, state: 'skipped' });
  }
  return result.map((s, i) => ({ ...s, id: `ap-${i + 1}` }));
}

export function currentStep(request: Pick<ServiceRequest, 'approvals'>): ApprovalStep | undefined {
  return request.approvals.find((s) => s.state === 'pending');
}

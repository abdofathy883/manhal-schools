export type PartSource = 'stock' | 'purchase' | 'vendor' | 'warranty';
export type ExecutionMethod = 'internal' | 'contract' | 'direct_purchase' | 'quote' | 'warranty';
export type ClosureDecision = 'close' | 'warranty_followup' | 'additional_maintenance' | 'convert_to_project';
export type AssetCondition = 'working' | 'partial' | 'stopped' | 'replaced';

export interface PartLine {
  /** Warehouse item this line draws on (set when picked from the stock list). */
  itemId?: string;
  description: string;
  partNo: string;
  qty: number;
  source: PartSource;
  /** Unit cost in SAR. */
  cost: number;
}

/** Executor-only data of a building-maintenance request (kept in `details.execution`). */
export interface ExecutionData {
  category?: string;
  specialtyId?: string;
  /** ISO date by which the first response is targeted. */
  targetResponse?: string;
  method?: ExecutionMethod;
  inspection?: { result: string; rootCause: string; repairPlan: string; needsParts: boolean };
  parts: PartLine[];
  workDone?: string;
  testResult?: string;
  startAt?: string;
  endAt?: string;
  downtimeHours?: number;
  labourHours?: number;
}

export interface ClosureData {
  decision: ClosureDecision;
  assetCondition: AssetCondition;
  followUpDate?: string;
  at: string;
}

/** Hourly labour rate (SAR) used to cost recorded labour hours. */
export const LABOUR_RATE = 60;

export const EXECUTION_KEY = 'execution';
export const CLOSURE_KEY = 'closure';
/** `details` keys that only executors may receive. */
/** Quotes, purchase order and receipt of a purchase request are visible to purchasing and finance only. */
export const INTERNAL_DETAIL_KEYS: readonly string[] = [EXECUTION_KEY, CLOSURE_KEY, 'procurement'];

export const METHOD_LABELS: Record<ExecutionMethod, string> = {
  internal: 'فريق داخلي',
  contract: 'عقد صيانة',
  direct_purchase: 'شراء مباشر',
  quote: 'عرض سعر',
  warranty: 'ضمان',
};

export const PART_SOURCE_LABELS: Record<PartSource, string> = {
  stock: 'المستودع',
  purchase: 'شراء',
  vendor: 'المورد',
  warranty: 'الضمان',
};

export const DECISION_LABELS: Record<ClosureDecision, string> = {
  close: 'إغلاق',
  warranty_followup: 'متابعة ضمان',
  additional_maintenance: 'صيانة إضافية',
  convert_to_project: 'تحويل لمشروع',
};

export const ASSET_CONDITION_LABELS: Record<AssetCondition, string> = {
  working: 'يعمل',
  partial: 'يعمل جزئيًا',
  stopped: 'متوقف',
  replaced: 'مستبدل',
};

export const REQUEST_CATEGORY_OPTIONS: readonly string[] = ['عطل طارئ', 'عطل عادي', 'صيانة وقائية', 'تحسين / تعديل'];

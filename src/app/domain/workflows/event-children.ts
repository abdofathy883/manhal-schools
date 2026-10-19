import { MAX_PASSENGERS, MIN_PASSENGERS, busesFor, isDayKey } from '../bookings/booking-rules';
import { ServiceRequest } from '../models/request';
import { EVENT_NEED_LABELS } from '../reference-data';
import { RequestDraft } from './engine';

export type EventNeed = keyof typeof EVENT_NEED_LABELS;

export interface ChildPlan {
  need: EventNeed;
  draft: RequestDraft;
}

export function tripCodeFor(dateKey: string, seed: number): string {
  return `TRP-${dateKey.replaceAll('-', '')}-${String(10 + (seed % 90))}`;
}

/** One child request per ticked need of the event. Their details are placeholders the executors refine. */
export function planChildren(event: ServiceRequest): ChildPlan[] {
  const needs = Array.isArray(event.details['needs']) ? (event.details['needs'] as string[]) : [];
  const place = String(event.details['place'] ?? '');
  const date = event.details['eventDate'];
  const base = {
    branchId: event.branchId,
    departmentId: event.departmentId,
    requesterMobile: event.requesterMobile,
    attachments: [],
    estimatedValue: 0,
  };

  const plans: ChildPlan[] = [];
  for (const need of needs) {
    switch (need) {
      case 'bus': {
        const passengers = Math.min(MAX_PASSENGERS, Math.max(MIN_PASSENGERS, Number(event.details['attendees'] ?? MIN_PASSENGERS)));
        const tripDate = isDayKey(date) ? date : '';
        plans.push({
          need,
          draft: {
            ...base,
            service: 'bus-booking',
            titleAr: `حجز باص لفعالية: ${event.titleAr}`,
            descriptionAr: `حجز باصات مرتبط بالفعالية ${event.refNo}. يؤكد مسؤول النقل الموعد والعدد.`,
            priority: 'normal',
            details: {
              tripDate,
              tripCode: tripCodeFor(tripDate || '00000000', event.refNo.length + passengers),
              destination: place || 'موقع الفعالية',
              purposeId: 'tp-activity',
              passengers,
              buses: busesFor(passengers),
              departTime: '08:00',
              returnTime: '12:00',
              // Spawned from an approved event: the transport officer confirms it rather than the booking rules.
              withinRules: false,
              waitlisted: false,
              pledgeAccepted: true,
              pledgeBy: event.requesterName,
            },
          },
        });
        break;
      }
      case 'venue':
        plans.push({
          need,
          draft: {
            ...base,
            service: 'building-maintenance',
            titleAr: `تجهيز مكان الفعالية: ${event.titleAr}`,
            descriptionAr: `تجهيز وصيانة المكان قبل الفعالية ${event.refNo} (${place || 'موقع الفعالية'}): الإنارة والتكييف والمقاعد والمنصة.`,
            priority: 'normal',
            details: { building: place || 'موقع الفعالية', specialty: 'sp-other', injury: false },
          },
        });
        break;
      case 'materials':
        plans.push({
          need,
          draft: {
            ...base,
            service: 'warehouse-need',
            titleAr: `مواد الفعالية: ${event.titleAr}`,
            descriptionAr: `احتياج المواد من المستودع للفعالية ${event.refNo}. الأصناف الأساسية للفعالية مُدرجة ويعدّلها أمين المستودع عند الحاجة.`,
            priority: 'normal',
            // Standard event kit (board markers, tissues); the warehouse keeper can adjust it with the requester.
            details: { items: [{ itemId: 'it-27', qty: 10 }, { itemId: 'it-32', qty: 4 }] },
          },
        });
        break;
    }
  }
  return plans;
}

import { RRule, Weekday } from 'rrule';

export type RecurFreq = 'daily' | 'weekly' | 'biweekly' | 'monthly';
export type WeekdayStr = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU';

const WEEKDAY_MAP: Record<WeekdayStr, Weekday> = {
  MO: RRule.MO,
  TU: RRule.TU,
  WE: RRule.WE,
  TH: RRule.TH,
  FR: RRule.FR,
  SA: RRule.SA,
  SU: RRule.SU,
};

export function buildRrule(
  freq: RecurFreq,
  days: WeekdayStr[] = []
): string {
  let options: ConstructorParameters<typeof RRule>[0];

  switch (freq) {
    case 'daily':
      options = { freq: RRule.DAILY };
      break;
    case 'weekly':
      options = {
        freq: RRule.WEEKLY,
        byweekday: days.map((d) => WEEKDAY_MAP[d]),
      };
      break;
    case 'biweekly':
      options = {
        freq: RRule.WEEKLY,
        interval: 2,
        byweekday: days.map((d) => WEEKDAY_MAP[d]),
      };
      break;
    case 'monthly':
      options = { freq: RRule.MONTHLY };
      break;
  }

  const rule = new RRule(options);
  // Strip the "RRULE:" prefix — store just the rule string
  return rule.toString().replace(/^RRULE:/, '');
}

export function rruleToText(rruleStr: string | null | undefined): string {
  if (!rruleStr) return '';
  try {
    const rule = new RRule(
      RRule.parseString(rruleStr.replace(/^RRULE:/, ''))
    );
    return rule.toText();
  } catch {
    return rruleStr;
  }
}

export function freqFromRrule(rruleStr: string): RecurFreq {
  const str = rruleStr.toUpperCase();
  if (str.includes('INTERVAL=2')) return 'biweekly';
  if (str.includes('FREQ=DAILY')) return 'daily';
  if (str.includes('FREQ=MONTHLY')) return 'monthly';
  return 'weekly';
}

export function daysFromRrule(rruleStr: string): WeekdayStr[] {
  const match = rruleStr.match(/BYDAY=([^;]+)/i);
  if (!match) return [];
  return match[1].split(',') as WeekdayStr[];
}

const WEEKDAYS: WeekdayStr[] = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

/**
 * Build an RRULE string from a proposal's frequency value. Used by the
 * Convert-to-Job flow to translate the proposal builder's frequency
 * choice into an iCal RRULE that the recurring materializer understands.
 *
 * - "weekly" / "biweekly" anchor on the given start date's day of week.
 * - "monthly" recurs on the same calendar day each month.
 * - "seasonal" + "annual" map to yearly with a count.
 * - "one_time" returns null (caller should use the non-recurring path).
 */
export function frequencyToRRule(
  frequency: string,
  startDate: Date,
  endDate?: Date | null,
): string | null {
  const freq = (frequency ?? '').toLowerCase();
  const dayCode = WEEKDAYS[startDate.getUTCDay()];
  const until = endDate
    ? `;UNTIL=${endDate.toISOString().slice(0, 10).replace(/-/g, '')}T235959Z`
    : '';
  switch (freq) {
    case 'one_time':
    case 'one-time':
      return null;
    case 'weekly':
      return `FREQ=WEEKLY;BYDAY=${dayCode}${until}`;
    case 'biweekly':
    case 'bi-weekly':
      return `FREQ=WEEKLY;INTERVAL=2;BYDAY=${dayCode}${until}`;
    case 'monthly':
      return `FREQ=MONTHLY;BYMONTHDAY=${startDate.getUTCDate()}${until}`;
    case 'seasonal':
      // 4 visits/year — quarterly anchored on the start day.
      return `FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=${startDate.getUTCDate()}${until}`;
    case 'annual':
    case 'yearly':
      return `FREQ=YEARLY${until}`;
    default:
      return null;
  }
}

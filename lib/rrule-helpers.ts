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

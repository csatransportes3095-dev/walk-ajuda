import { strict as assert } from 'node:assert';
import { classifyH2ScoreAt } from '../server/loans/h2Score';

const config = { onTimePoints: 4, eveningPoints: 1, nightPoints: 0, afterDuePoints: -5 };
const dueDate = '2026-08-14';

function atBrazil(hour: number, minute: number, day = 14) {
  const instant = new Date(Date.UTC(2026, 7, day, 0, minute, 0));
  instant.setUTCHours(hour + 3);
  return instant;
}

const cases = [
  ['17:55 até 18h = +4', atBrazil(17, 55), { scoreBand: 'ate_18h', proposedPoints: 4 }],
  ['18:00 ainda = +4', atBrazil(18, 0), { scoreBand: 'ate_18h', proposedPoints: 4 }],
  ['18:01 = +1', atBrazil(18, 1), { scoreBand: 'apos_18h', proposedPoints: 1 }],
  ['19:59 = +1', atBrazil(19, 59), { scoreBand: 'apos_18h', proposedPoints: 1 }],
  ['20:00 = 0', atBrazil(20, 0), { scoreBand: 'apos_20h', proposedPoints: 0 }],
  ['23:59 = 0', atBrazil(23, 59), { scoreBand: 'apos_20h', proposedPoints: 0 }],
  ['dia seguinte = -5', atBrazil(0, 5, 15), { scoreBand: 'apos_vencimento', proposedPoints: -5 }],
] as const;

for (const [label, instant, expected] of cases) {
  assert.deepEqual(classifyH2ScoreAt(dueDate, config, instant), expected, label);
  console.log(`OK - ${label}`);
}
console.log(`${cases.length} cenários de H2 Score aprovados.`);

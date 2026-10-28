import {fmt} from '../lib/format';
import {ppDiff, variance, variancePct} from '../lib/metrics';
import {VarianceText} from './ui';

/** "▲ +$45K (+1.6%)" against a reference, or n/a. */
export function MoneyVar({actual, target}: {actual: number | null; target: number | null}) {
  const v = variance(actual, target);
  return <VarianceText value={v} text={`${fmt.signedCompactMoney(v)} (${fmt.signedPct(variancePct(actual, target))})`} />;
}
export function HoursVar({actual, target}: {actual: number | null; target: number | null}) {
  const v = variance(actual, target);
  return <VarianceText value={v} text={`${fmt.signedInt(v)} hrs (${fmt.signedPct(variancePct(actual, target))})`} />;
}
/** Rate difference in percentage points. */
export function RateVar({actual, target}: {actual: number | null; target: number | null}) {
  const v = ppDiff(actual, target);
  return <VarianceText value={v} text={fmt.pp(v)} />;
}
export function RatioVar({actual, target, digits = 1, prefix = ''}: {actual: number | null; target: number | null; digits?: 1 | 2; prefix?: string}) {
  const v = variance(actual, target);
  return <VarianceText value={v} text={`${v === null ? '' : v > 0 ? '+' : v < 0 ? '−' : ''}${prefix}${digits === 1 ? fmt.dec1(v === null ? null : Math.abs(v)) : fmt.dec2(v === null ? null : Math.abs(v))} (${fmt.signedPct(variancePct(actual, target))})`} />;
}
export function PctVar({actual, target}: {actual: number | null; target: number | null}) {
  const v = variancePct(actual, target);
  return <VarianceText value={v} text={fmt.signedPct(v)} />;
}

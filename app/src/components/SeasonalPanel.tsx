import { useState } from "react";
import type { WellSeasonality } from "../validationData";
import { copy, fmtFt } from "../copy";

const FULL_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const UNCONFINED_COLOR = "#e66101";
const SELECTED_COLOR = "#12384b";

type Props = { data: WellSeasonality; selectedWell: string | null };

export default function SeasonalPanel({ data, selectedWell }: Props) {
  const [focusMonth, setFocusMonth] = useState<number | null>(null);
  const conf = data.groups.confined;
  const unc = data.groups.unconfined;
  const sel = selectedWell ? data.per_well[selectedWell] : undefined;
  const all = [...conf.monthly_q25, ...conf.monthly_q75, ...Object.values(unc.monthly_mean).flat(), ...(sel?.monthly ?? [])];
  const lo = Math.min(...all, 0) - 0.3, hi = Math.max(...all, 0) + 0.3;
  const W = 340, H = 190, left = 34, right = 8, top = 10, bottom = 22;
  const x = (m: number) => left + m / 11 * (W - left - right);
  const y = (v: number) => top + (hi - v) / (hi - lo) * (H - top - bottom);
  const line = (vals: number[]) => vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const band = `${conf.monthly_q75.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join(" ")} ${[...conf.monthly_q25].reverse().map((v, i) => `L${x(11 - i)},${y(v)}`).join(" ")} Z`;
  const ticks = [Math.ceil(lo), 0, Math.floor(hi)].filter((v, i, a) => a.indexOf(v) === i);
  const readout = (m: number) => {
    const parts = [`${MONTHS[m]}: confined median ${fmtFt(conf.monthly_median[m])} ft (middle half ${fmtFt(conf.monthly_q25[m])} to ${fmtFt(conf.monthly_q75[m])})`];
    for (const [w, vals] of Object.entries(unc.monthly_mean)) parts.push(`${w} ${fmtFt(vals[m])} ft`);
    if (sel && selectedWell) parts.push(`${selectedWell} ${fmtFt(sel.monthly[m])} ft`);
    return parts.join(" · ");
  };
  const peak = conf.monthly_median.indexOf(Math.max(...conf.monthly_median));
  const trough = conf.monthly_median.indexOf(Math.min(...conf.monthly_median));
  return (
    <section className="panel" aria-labelledby="seasonal-title">
      <h2 id="seasonal-title">{copy.seasonalTitle}</h2>
      <p className="note">{copy.seasonalCaption(FULL_MONTHS[peak], FULL_MONTHS[trough])}</p>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" width="100%"
        aria-label={`Typical within-year level by month. Confined wells (${conf.wells.length}): median peaks in ${MONTHS[peak]} and is lowest in ${MONTHS[trough]}.`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={left} x2={W - right} y1={y(t)} y2={y(t)} stroke={t === 0 ? "#7d8a94" : "#e1e5e8"} strokeWidth={t === 0 ? 1.2 : 0.8} />
            <text x={left - 4} y={y(t) + 3} textAnchor="end" fontSize="9" fill="#475569">{t > 0 ? `+${t}` : t}</text>
          </g>
        ))}
        <text x={W - right} y={y(0) - 3} textAnchor="end" fontSize="8" fill="#475569">{copy.seasonalZero}</text>
        <path d={band} fill="#2a78d6" fillOpacity="0.18" />
        <path d={line(conf.monthly_median)} fill="none" stroke="#2a78d6" strokeWidth="2" />
        {Object.entries(unc.monthly_mean).map(([w, vals]) => (
          <path key={w} d={line(vals)} fill="none" stroke={UNCONFINED_COLOR} strokeWidth="1.1" strokeDasharray="4 2" />
        ))}
        {sel && <path d={line(sel.monthly)} fill="none" stroke={SELECTED_COLOR} strokeWidth="2.2" />}
        {MONTHS.map((m, i) => (
          <g key={m} tabIndex={0} role="button" aria-label={readout(i)} className="month-hit"
            onFocus={() => setFocusMonth(i)} onBlur={() => setFocusMonth(null)}
            onMouseEnter={() => setFocusMonth(i)} onMouseLeave={() => setFocusMonth(null)}>
            <rect x={x(i) - 12} y={top} width="24" height={H - top - bottom} fill={focusMonth === i ? "#12384b14" : "transparent"} />
            <circle cx={x(i)} cy={y(conf.monthly_median[i])} r="3" fill="#fff" stroke="#2a78d6" strokeWidth="1.5" />
            <text x={x(i)} y={H - 6} textAnchor="middle" fontSize="9" fill="#475569">{m[0]}</text>
          </g>
        ))}
      </svg>
      <ul className="key">
        <li><span className="swatch" style={{ background: "#2a78d6" }} /> Confined wells, median and middle half ({conf.wells.length} wells)</li>
        <li><span className="swatch dashed" style={{ borderColor: UNCONFINED_COLOR }} /> Unconfined, shallow ({unc.wells.length} wells: {unc.wells.join(", ")})</li>
        {selectedWell && <li>{sel
          ? <><span className="swatch" style={{ background: SELECTED_COLOR }} /> {selectedWell} (median {sel.years_per_month_median} years per month)</>
          : <>{selectedWell}: {copy.seasonalNoCurve}</>}</li>}
        {!selectedWell && <li className="hint">Click a well on the map to draw its own curve.</li>}
      </ul>
      <p className="readout" aria-live="polite">{focusMonth === null ? "Focus or hover a month for its values (ft)." : readout(focusMonth)}</p>
    </section>
  );
}

import type { IntervalSummaryEntry } from "../validationData";
import { copy, fmtChange, fmtInt, fmtPct, fmtRain } from "../copy";

type Props = {
  intervals: IntervalSummaryEntry[];
  /** The interval ending at the selected date, or null on the first date. */
  selected: IntervalSummaryEntry | null;
  onSelectInterval: (toDate: string) => void;
  changeEps: number;
};

type Row = { title: string; unit: string; value: (i: IntervalSummaryEntry) => number | null; format: (v: number | null) => string; diverging: boolean };

const ROWS: Row[] = [
  { title: "Rain", unit: "in, approximate", value: (i) => i.rain_in_mean, format: fmtRain, diverging: false },
  { title: "Mean change", unit: "m³/m³", value: (i) => i.change_mean, format: fmtChange, diverging: true },
];

function BarRow({ row, intervals, selected, onSelectInterval }: { row: Row } & Omit<Props, "changeEps">) {
  const vals = intervals.map(row.value);
  const finite = vals.filter((v): v is number => v !== null);
  const W = 300, H = 64, gap = 4;
  const bw = (W - gap * (intervals.length - 1)) / intervals.length;
  const max = Math.max(...finite.map(Math.abs), 1e-9);
  const zeroY = row.diverging ? H / 2 : H - 2;
  const scale = row.diverging ? (H / 2 - 4) / max : (H - 6) / max;
  return (
    <div className="bar-row">
      <div className="bar-row-title">{row.title} <span>({row.unit})</span></div>
      <div className="bar-row-bars" style={{ ["--bar-w" as string]: `${(bw / W) * 100}%`, ["--bar-gap" as string]: `${(gap / W) * 100}%` }}>
        <svg viewBox={`0 0 ${W} ${H}`} aria-hidden="true" preserveAspectRatio="none">
          <line x1="0" x2={W} y1={zeroY} y2={zeroY} stroke="#9aa5ae" strokeWidth="1" />
          {intervals.map((iv, k) => {
            const v = vals[k];
            const x = k * (bw + gap);
            if (v === null) return <text key={iv.to} x={x + bw / 2} y={zeroY - 4} textAnchor="middle" fontSize="8" fill="#5d6b75">n/a</text>;
            const h = Math.max(Math.abs(v) * scale, 1);
            const y = v >= 0 ? zeroY - h : zeroY;
            const isSel = selected?.to === iv.to;
            return <rect key={iv.to} x={x} y={y} width={bw} height={h}
              fill={isSel ? "#12384b" : row.diverging ? (v >= 0 ? "#6b9ac4" : "#d99a6c") : "#8fb3c9"}
              stroke={isSel ? "#12384b" : "none"} strokeWidth="1.5" />;
          })}
        </svg>
        <div className="bar-row-buttons">
          {intervals.map((iv, k) => (
            <button key={iv.to} type="button" className={selected?.to === iv.to ? "is-selected" : ""}
              aria-pressed={selected?.to === iv.to}
              aria-label={`${iv.label}: ${row.title.toLowerCase()} ${row.format(vals[k])} ${row.unit}. Show this interval.`}
              onClick={() => onSelectInterval(iv.to)} />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function IntervalCard(props: Props) {
  const { selected, intervals } = props;
  const rain = fmtRain(selected?.rain_in_mean);
  const change = fmtChange(selected?.change_mean);
  const share = fmtPct(selected?.valid_share);
  const note = !selected ? copy.intervalFirst
    : selected.is_max_rain ? copy.intervalMaxRain(rain, change, share) : copy.intervalOther(rain, change, share);
  return (
    <section className="panel interval-card" aria-labelledby="interval-card-title">
      <h2 id="interval-card-title">{selected ? `${selected.label} · ${selected.days} days` : "Interval"}</h2>
      {selected?.is_max_rain && <p className="badge">{copy.maxRainBadge}</p>}
      {selected ? (
        <dl className="facts">
          <dt>Rain (approximate)</dt>
          <dd>{rain} in <span>hours of data {fmtInt(selected.rain_hours_available)} of {fmtInt(selected.rain_hours_expected)}</span></dd>
          <dt>Mean change</dt>
          <dd>{change} m³/m³ <span>over {fmtInt(selected.paired_pixels)} pixels valid on both dates ({share}% of the area)</span></dd>
          <dt>Median · 10th to 90th pct</dt>
          <dd>{fmtChange(selected.change_median)} · {fmtChange(selected.change_p10)} to {fmtChange(selected.change_p90)} m³/m³</dd>
          <dt>Pixels wetter · drier</dt>
          <dd>{fmtPct(selected.share_wetter)}% · {fmtPct(selected.share_drier)}% <span>(beyond ±{props.changeEps} m³/m³)</span></dd>
        </dl>
      ) : null}
      <p className="note">{note}</p>
      <div className="bars" role="group" aria-label="All eight intervals; each bar selects that interval">
        {ROWS.map((row) => <BarRow key={row.title} row={row} {...props} />)}
        <div className="bar-row-labels" aria-hidden="true">
          {intervals.map((iv) => <span key={iv.to}>{iv.label.split(" to ")[1]}</span>)}
        </div>
      </div>
      <p className="sr-only">{selected
        ? `${selected.label}: rain ${rain} inches, approximate; mean soil moisture change ${change} cubic metres per cubic metre over ${share} percent of the area.`
        : copy.intervalFirst}</p>
    </section>
  );
}

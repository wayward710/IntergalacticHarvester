import type { BondvilleCheck } from "../validationData";
import { copy, fmtSm, NO_DATA } from "../copy";
import { formatDate } from "../layers";

type Props = { data: BondvilleCheck; appDates: string[] };

const iso = (d8: string) => `${d8.slice(0, 4)}-${d8.slice(4, 6)}-${d8.slice(6, 8)}`;

export default function BondvillePanel({ data, appDates }: Props) {
  // Show only the app's own acquisition dates.
  const nisar = data.nisar.filter((n) => appDates.includes(n.date));
  const valid = nisar.filter((n) => n.valid && n.pixel !== null);
  const gaps = valid.filter((n) => n.probe_5 !== null).map((n) => n.pixel! - n.probe_5!);
  const meanGap = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : null;
  const daily = data.probe.daily;
  const t0 = Date.parse(`${daily[0].date}T00:00:00Z`), t1 = Date.parse(`${daily[daily.length - 1].date}T00:00:00Z`);
  const vals = [...daily.flatMap((d) => [d.vwc_5, d.vwc_10]), ...nisar.flatMap((n) => [n.pixel, n.scene_mean])]
    .filter((v): v is number => v !== null);
  const lo = Math.max(0, Math.min(...vals) - 0.03), hi = Math.max(...vals) + 0.03;
  const W = 340, H = 200, left = 34, right = 8, top = 10, bottom = 34;
  const x = (d: string) => left + (Date.parse(`${d}T00:00:00Z`) - t0) / (t1 - t0) * (W - left - right);
  const y = (v: number) => top + (hi - v) / (hi - lo) * (H - top - bottom);
  const axisY = H - bottom;
  const path = (key: "vwc_5" | "vwc_10") => {
    let d = "", prev = false;
    for (const p of daily) {
      const v = p[key];
      if (v === null) { prev = false; continue; }
      d += `${prev ? "L" : "M"}${x(p.date).toFixed(1)},${y(v).toFixed(1)} `;
      prev = true;
    }
    return d.trim();
  };
  const ticks = [0.1, 0.2, 0.3, 0.4].filter((t) => t >= lo && t <= hi);
  const months = ["2026-07-01", "2026-08-01", "2026-09-01", "2026-10-01"];
  return (
    <section className="panel" aria-labelledby="bondville-title">
      <h2 id="bondville-title">{copy.bondvilleTitle}</h2>
      <p className="note">{data.site.name}. Volumetric water content, m³/m³.</p>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img"
        aria-label={`Probe soil moisture at 5 and 10 cm, daily, with NISAR values at the probe pixel on ${valid.length} of ${nisar.length} dates; the other dates had no retrieval.`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={left} x2={W - right} y1={y(t)} y2={y(t)} stroke="#e1e5e8" />
            <text x={left - 4} y={y(t) + 3} textAnchor="end" fontSize="9" fill="#475569">{t.toFixed(1)}</text>
          </g>
        ))}
        <line x1={left} x2={W - right} y1={axisY} y2={axisY} stroke="#9aa5ae" />
        {months.map((m) => <text key={m} x={x(m)} y={axisY + 24} textAnchor="middle" fontSize="9" fill="#475569">{new Date(m).toLocaleString("en-US", { month: "short", timeZone: "UTC" })}</text>)}
        <path d={path("vwc_5")} fill="none" stroke="#0f766e" strokeWidth="1.3" />
        <path d={path("vwc_10")} fill="none" stroke="#0f766e" strokeWidth="1.1" strokeDasharray="3 2" />
        {nisar.map((n) => {
          const cx = x(iso(n.date));
          return (
            <g key={n.date}>
              {n.scene_mean !== null && <line x1={cx - 5} x2={cx + 5} y1={y(n.scene_mean)} y2={y(n.scene_mean)} stroke="#7c3aed" strokeWidth="1.6" />}
              {n.valid && n.pixel !== null
                ? <rect x={cx - 4} y={y(n.pixel) - 4} width="8" height="8" fill="#7c3aed" transform={`rotate(45 ${cx} ${y(n.pixel)})`} />
                : <circle cx={cx} cy={axisY} r="3.5" fill="#fff" stroke="#7c3aed" strokeWidth="1.4" />}
            </g>
          );
        })}
        <text x={left + 2} y={axisY + 12} fontSize="8" fill="#5d6b75">○ on the axis = {copy.bondvilleNoRetrieval}</text>
      </svg>
      <ul className="key">
        <li><span className="swatch" style={{ background: "#0f766e" }} /> Probe 5 cm (solid) and 10 cm (dashed), daily mean</li>
        <li><span aria-hidden="true" style={{ color: "#7c3aed" }}>◆</span> NISAR pixel at the probe · <span aria-hidden="true" style={{ color: "#7c3aed" }}>—</span> NISAR scene mean</li>
      </ul>
      <table className="data-table">
        <caption className="sr-only">Probe and NISAR values on each NISAR date</caption>
        <thead><tr><th scope="col">Date</th><th scope="col">Probe 5 cm</th><th scope="col">Probe 10 cm</th><th scope="col">NISAR pixel</th><th scope="col">Scene mean</th></tr></thead>
        <tbody>
          {nisar.map((n) => (
            <tr key={n.date}>
              <th scope="row">{formatDate(n.date).replace(", 2026", "")}</th>
              <td>{fmtSm(n.probe_5)}</td><td>{fmtSm(n.probe_10)}</td>
              <td>{n.valid ? fmtSm(n.pixel) : copy.bondvilleNoRetrieval}</td><td>{fmtSm(n.scene_mean)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>NISAR retrieval at the probe on <b>{valid.length} of {nisar.length}</b> dates. Average gap, NISAR minus probe (5 cm): <b>{meanGap === null ? NO_DATA : `${meanGap >= 0 ? "+" : "−"}${Math.abs(meanGap).toFixed(3)} m³/m³`}</b>.</p>
      <p className="note">{meanGap === null
        ? copy.bondvilleCaption(valid.length, NO_DATA, "relative to")
        : copy.bondvilleCaption(valid.length, Math.abs(meanGap).toFixed(3), meanGap >= 0 ? "above" : "below")}</p>
    </section>
  );
}

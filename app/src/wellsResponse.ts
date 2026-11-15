import UniqueValueRenderer from "@arcgis/core/renderers/UniqueValueRenderer.js";
import SimpleMarkerSymbol from "@arcgis/core/symbols/SimpleMarkerSymbol.js";
import type { IntervalSummaryEntry, WellClass, WellResponse, WellsResponse } from "./validationData";
import { copy, fmtFt, fmtRain } from "./copy";

// Class is encoded by colour AND shape, so the map still reads in grayscale and for colour-blind viewers.
export const CLASS_STYLE: Record<WellClass | "none", { color: string; glyph: string }> = {
  rose: { color: "#2166ac", glyph: "▲" },
  flat: { color: "#7a7a7a", glyph: "●" },
  fell: { color: "#e66101", glyph: "▼" },
  none: { color: "#7a7a7a", glyph: "○" },
};

function symbolFor(cls: WellClass | null) {
  const outline = { color: [30, 41, 59, 1], width: 1 };
  if (cls === "rose") return new SimpleMarkerSymbol({ style: "triangle", color: CLASS_STYLE.rose.color, size: 13, outline });
  if (cls === "fell") return new SimpleMarkerSymbol({ style: "triangle", angle: 180, color: CLASS_STYLE.fell.color, size: 13, outline });
  if (cls === "flat") return new SimpleMarkerSymbol({ style: "circle", color: CLASS_STYLE.flat.color, size: 10, outline });
  return new SimpleMarkerSymbol({ style: "circle", color: [255, 255, 255, 0], size: 10, outline: { color: CLASS_STYLE.none.color, width: 2 } });
}

/** One symbol per well for the selected interval; rebuilt whenever the interval changes. */
export function responseRenderer(data: WellsResponse, key: string | null) {
  return new UniqueValueRenderer({
    field: "well",
    defaultSymbol: symbolFor(null),
    defaultLabel: copy.wellsLegendItems(String(data.flat_threshold_ft)).none,
    uniqueValueInfos: data.wells.map((w) => ({ value: w.well, symbol: symbolFor(key ? w.class[key] ?? null : null) })),
  });
}

export function classCounts(data: WellsResponse, key: string | null) {
  const counts = { rose: 0, flat: 0, fell: 0, none: 0 };
  for (const w of data.wells) {
    const c = key ? w.class[key] : null;
    counts[c ?? "none"] += 1;
  }
  return counts;
}

const svgNs = "http://www.w3.org/2000/svg";
function svgEl(tag: string, attrs: Record<string, string | number>, text?: string) {
  const el = document.createElementNS(svgNs, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  if (text !== undefined) el.textContent = text;
  return el;
}

/** Popup additions: per-interval change strip with rain bars beneath, and the storm-window line. */
export function wellResponseContent(well: WellResponse | undefined, data: WellsResponse, intervals: IntervalSummaryEntry[], selectedKey: string | null): HTMLElement {
  const root = document.createElement("div");
  root.className = "well-response";
  if (!well) {
    root.textContent = copy.wellPopupNoHistory;
    return root;
  }
  const heading = document.createElement("strong");
  heading.textContent = "Change in each interval (ft, unit unverified)";
  root.appendChild(heading);

  const W = 340, H = 118, left = 34, right = 6, gap = 3;
  const n = data.intervals.length;
  const bw = (W - left - right - gap * (n - 1)) / n;
  const changes = data.intervals.map((k) => well.changes_ft[k]);
  const maxCh = Math.max(0.2, ...changes.filter((v): v is number => v !== null).map(Math.abs));
  const rains = intervals.map((i) => i.rain_in_mean);
  const maxRain = Math.max(0.1, ...rains.filter((v): v is number => v !== null));
  const topH = 64, zero = 4 + topH / 2, rainTop = topH + 14, rainH = 26;
  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", width: "100%",
    "aria-label": `Level change per interval for ${well.well}: ` + data.intervals.map((k, i) => `${intervals[i]?.label ?? k} ${fmtFt(changes[i])} ft`).join("; ") });
  svg.appendChild(svgEl("line", { x1: left, x2: W - right, y1: zero, y2: zero, stroke: "#9aa5ae" }));
  svg.appendChild(svgEl("text", { x: left - 4, y: 10, "text-anchor": "end", "font-size": 8, fill: "#475569" }, `+${maxCh.toFixed(1)}`));
  svg.appendChild(svgEl("text", { x: left - 4, y: zero + 3, "text-anchor": "end", "font-size": 8, fill: "#475569" }, "0 ft"));
  svg.appendChild(svgEl("text", { x: left - 4, y: topH + 4, "text-anchor": "end", "font-size": 8, fill: "#475569" }, `−${maxCh.toFixed(1)}`));
  svg.appendChild(svgEl("text", { x: left - 4, y: rainTop + 10, "text-anchor": "end", "font-size": 8, fill: "#475569" }, "rain"));
  data.intervals.forEach((k, i) => {
    const x = left + i * (bw + gap);
    const sel = k === selectedKey;
    const v = changes[i];
    if (sel) svg.appendChild(svgEl("rect", { x: x - 1.5, y: 1, width: bw + 3, height: H - 12, fill: "none", stroke: "#12384b", "stroke-width": 1.5, rx: 2 }));
    if (v === null) {
      svg.appendChild(svgEl("text", { x: x + bw / 2, y: zero - 3, "text-anchor": "middle", "font-size": 7, fill: "#5d6b75" }, "no data"));
    } else {
      const h = Math.max(Math.abs(v) / maxCh * (topH / 2 - 2), 1);
      const cls = well.class[k] ?? "flat";
      svg.appendChild(svgEl("rect", { x, y: v >= 0 ? zero - h : zero, width: bw, height: h, fill: CLASS_STYLE[cls].color }));
    }
    const rv = rains[i];
    if (rv !== null && rv !== undefined) {
      const rh = Math.max(rv / maxRain * rainH, 1);
      svg.appendChild(svgEl("rect", { x, y: rainTop + rainH - rh, width: bw, height: rh, fill: "#8fb3c9" }));
    }
    const lbl = intervals[i]?.label.split(" to ")[1] ?? "";
    svg.appendChild(svgEl("text", { x: x + bw / 2, y: H - 2, "text-anchor": "middle", "font-size": 7, fill: "#475569" }, lbl));
  });
  root.appendChild(svg);
  const rainNote = document.createElement("div");
  rainNote.className = "well-response-note";
  rainNote.textContent = `Blue-gray bars: area-average rain per interval, approximate (largest ${fmtRain(maxRain)} in). Boxed: selected interval.`;
  root.appendChild(rainNote);

  const storm = document.createElement("div");
  storm.className = "well-storm";
  if (!well.storm) {
    storm.textContent = copy.wellPopupNoHistory;
  } else {
    const s = well.storm;
    storm.appendChild(stormGlyph(s.q25, s.q75, s.typical_ft, s.y2026_ft));
    const p = document.createElement("p");
    p.textContent = copy.wellPopupStorm(data.storm_dates, fmtFt(s.y2026_ft), fmtFt(s.typical_ft), fmtFt(s.q25), fmtFt(s.q75));
    storm.appendChild(p);
  }
  root.appendChild(storm);
  return root;
}

/** Dot-and-range glyph: gray bar = typical middle half, gray dot = typical, orange diamond = 2026. */
function stormGlyph(q25: number, q75: number, typical: number, y2026: number) {
  const W = 340, H = 26, pad = 14;
  const lo = Math.min(q25, y2026, 0) - 0.2, hi = Math.max(q75, y2026, 0) + 0.2;
  const x = (v: number) => pad + (v - lo) / (hi - lo) * (W - 2 * pad);
  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", "aria-hidden": "true" });
  svg.appendChild(svgEl("line", { x1: x(0), x2: x(0), y1: 2, y2: H - 2, stroke: "#c4cbd1" }));
  svg.appendChild(svgEl("line", { x1: x(q25), x2: x(q75), y1: 12, y2: 12, stroke: "#c9ced3", "stroke-width": 7, "stroke-linecap": "round" }));
  svg.appendChild(svgEl("circle", { cx: x(typical), cy: 12, r: 4, fill: "#52514e" }));
  svg.appendChild(svgEl("rect", { x: x(y2026) - 4.5, y: 7.5, width: 9, height: 9, fill: "#e66101", transform: `rotate(45 ${x(y2026)} 12)` }));
  svg.appendChild(svgEl("text", { x: x(0), y: H, "text-anchor": "middle", "font-size": 7, fill: "#475569" }, "0 ft"));
  return svg;
}

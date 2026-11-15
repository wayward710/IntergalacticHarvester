// All on-screen wording for the validation and context features, in one place so it can be
// edited without touching components. Values come from the JSON files at run time; any missing
// value renders as "no data", never as a blank or a zero.

export const NO_DATA = "no data";

const ok = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);

/** Soil moisture change in m³/m³ with an explicit sign, e.g. +0.042. */
export const fmtChange = (v: number | null | undefined) => (ok(v) ? `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(3)}` : NO_DATA);
/** Soil moisture in m³/m³, e.g. 0.294. */
export const fmtSm = (v: number | null | undefined) => (ok(v) ? v.toFixed(3) : NO_DATA);
export const fmtRain = (v: number | null | undefined) => (ok(v) ? v.toFixed(2) : NO_DATA);
export const fmtFt = (v: number | null | undefined) => (ok(v) ? `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(2)}` : NO_DATA);
export const fmtPct = (share: number | null | undefined) => (ok(share) ? String(Math.round(share * 100)) : NO_DATA);
export const fmtInt = (v: number | null | undefined) => (ok(v) ? v.toLocaleString("en-US") : NO_DATA);

export const copy = {
  intervalFirst: "First acquisition: no earlier date to compare.",
  intervalMaxRain: (rain: string, change: string, validShare: string) =>
    `Largest rain of the eight intervals (${rain} in). Mean change ${change} m³/m³ over ${validShare}% of the area.`,
  intervalOther: (rain: string, change: string, validShare: string) =>
    `Rain ${rain} in. Mean change ${change} m³/m³ over ${validShare}% of the area.`,
  maxRainBadge: "Largest rain of the 8 intervals",

  wellsLegendTitle: "Well level change in this interval (ft)",
  wellsLegendItems: (t: string) => ({
    rose: `rose more than ${t} ft`, flat: `within ${t} ft`, fell: `fell more than ${t} ft`, none: "no reading",
  }),
  wellsStormSummary: (nBeat: number, nHist: number, nRose: number) =>
    `${nBeat} of ${nHist} wells with history changed more than in a typical year over these dates; ${nRose} of ${nHist} rose.`,
  wellPopupStorm: (dates: string, y2026: string, typical: string, q25: string, q75: string) =>
    `${dates}: 2026 ${y2026} ft; typical year ${typical} ft (middle half ${q25} to ${q75}).`,
  wellPopupNoHistory: "No comparable history for this well.",

  seasonalTitle: "Wells by season",
  seasonalCaption: (high: string, low: string) => `Confined-well median: highest in ${high}, lowest in ${low}.`,
  seasonalNoCurve: "Not enough history for a seasonal curve.",
  seasonalZero: "that year's average",

  bondvilleTitle: "Ground check at Bondville",
  bondvilleMarker: "USCRN soil moisture probe (Bondville)",
  bondvilleCaption: "Probe: one point, 5 and 10 cm depth. NISAR: 200 m pixel, top few centimeters.",
  bondvilleNoRetrieval: "no retrieval",
};

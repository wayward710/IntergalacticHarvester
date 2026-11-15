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
    `Largest rain of the eight intervals (${rain} in, approximate). Mean change ${change} m³/m³ over ${validShare}% of the area.`,
  intervalOther: (rain: string, change: string, validShare: string) =>
    `Rain ${rain} in (approximate). Mean change ${change} m³/m³ over ${validShare}% of the area. Pixels with no retrieval on either date are left out.`,
  maxRainBadge: "Largest rain of the 8 intervals",

  wellsLegendTitle: "Well level change in this interval (ft, unit unverified)",
  wellsLegendItems: (t: string) => ({
    rose: `rose more than ${t} ft`, flat: `within ${t} ft`, fell: `fell more than ${t} ft`, none: "no reading",
  }),
  wellsStormSummary: (nBeat: number, nHist: number, nRose: number) =>
    `${nBeat} of ${nHist} wells with history changed more than in a typical year over these dates; ${nRose} of ${nHist} rose.`,
  wellPopupStorm: (dates: string, y2026: string, typical: string, q25: string, q75: string) =>
    `${dates}: 2026 ${y2026} ft; typical year ${typical} ft (middle half ${q25} to ${q75}).`,
  wellPopupNoHistory: "No comparable history for this well.",

  seasonalTitle: "Wells by season",
  seasonalCaption: "Levels are usually highest in spring and lowest in late summer. This shows when levels change, not why.",
  seasonalNoCurve: "Not enough history for a seasonal curve.",
  seasonalZero: "that year's average",

  bondvilleTitle: "Ground check at Bondville",
  bondvilleMarker: "USCRN soil moisture probe (Bondville)",
  bondvilleCaption: (n: number, gap: string, aboveOrBelow: string) =>
    `The probe measures one point at 5 to 10 cm. NISAR averages a 200 m pixel of the top few centimeters. On the ${n} dates with a NISAR retrieval, NISAR reads ${gap} m³/m³ ${aboveOrBelow} the probe on average. With so few dates we cannot say which is closer to the truth.`,
  bondvilleNoRetrieval: "no retrieval",

  coverageToggle: "Show where NISAR has no data",
  coverageLegend: "no retrieval",

  limitsTitle: "What we can and cannot say",
  limits: (stormDates: string) => [
    "We show what NISAR observed. We do not predict soil moisture.",
    "Pixels with no retrieval on either date are left out of every average, and the share of the area covered is shown beside each one.",
    "Rain totals come from MRMS radar and are approximate; hours with missing data count as zero.",
    "NISAR and the ground probe differ at Bondville (a 200 m pixel against one point at 5 to 10 cm). Too few dates are valid to say which is closer to the truth.",
    "Well levels follow a seasonal cycle and are also affected by human use we have no data for. We show patterns, not causes.",
    `The largest storm (${stormDates}) stands out in the wells. Over the whole window, 2026 looked ordinary.`,
    "The NISAR product used here is the L3 SME2 Provisional release and may change.",
    "A weather-driven model tracks soil moisture well at a ground probe and for the large storm, but not ordinary NISAR changes, so it is not shown.",
  ],

  tour: {
    intro: { title: "Mahomet Aquifer, summer 2026",
      text: () => "Nine NISAR passes between Jul 2 and Oct 18 give eight intervals. Three stops: a storm, the wells, and the limits." },
    storm: { title: "A big storm",
      text: (stormDates: string, rain: string, change: string) =>
        `From ${stormDates}, about ${rain} in of rain fell on average across the area (approximate). Where NISAR has a retrieval, mean soil moisture changed by ${change} m³/m³.` },
    wells: { title: "Did the aquifer respond?",
      text: (nBeat: number, nHist: number, nRose: number) =>
        `${nBeat} of ${nHist} wells changed more than in a typical year over these dates, and ${nRose} rose. Surface wetness at a well did not predict how that well changed, so this shows a response, not a cause.` },
    limits: { title: "What we cannot say",
      text: () => "NISAR and a ground probe differ at Bondville, and wells have seasonal and human influences we cannot measure. Open the limits panel for the full list." },
  },
};

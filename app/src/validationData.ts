import { useEffect, useState } from "react";

// Types and validators for the precomputed validation/context files written by
// processing/build_validation_data.py. Validators throw on invalid input, like layers.ts.

export type IntervalSummaryEntry = {
  from: string; to: string; label: string; days: number;
  rain_in_mean: number | null; rain_cells: number;
  rain_hours_available: number; rain_hours_expected: number;
  paired_pixels: number; valid_share: number | null;
  change_mean: number | null; change_median: number | null;
  change_p10: number | null; change_p90: number | null;
  share_wetter: number | null; share_drier: number | null;
  is_max_rain: boolean;
};
export type IntervalSummary = { method: string; change_eps: number; intervals: IntervalSummaryEntry[] };

export type WellClass = "rose" | "flat" | "fell";
export type StormBlock = {
  typical_ft: number; q25: number; q75: number; y2026_ft: number;
  above_typical_range: boolean; beat_typical: boolean;
};
export type WellResponse = {
  well: string; aquifer: string | null; aquifer_type: string | null; depth_ft: number | null;
  lat: number; lon: number;
  changes_ft: Record<string, number | null>;
  class: Record<string, WellClass | null>;
  storm: StormBlock | null;
};
export type WellsResponse = {
  units: string; flat_threshold_ft: number; storm_dates: string; method: string;
  intervals: string[]; wells: WellResponse[];
};

export type WellSeasonality = {
  note: string;
  groups: {
    confined: { wells: string[]; monthly_median: number[]; monthly_q25: number[]; monthly_q75: number[] };
    unconfined: { wells: string[]; monthly_mean: Record<string, number[]> };
  };
  storm_window: { dates: string; by_well: { well: string; typical_ft: number; q25: number; q75: number; y2026_ft: number }[] };
  per_well: Record<string, { monthly: number[]; years_per_month_median: number; aquifer_type: string; depth: number }>;
};

export type BondvilleNisar = {
  date: string; pixel: number | null; valid: boolean; scene_mean: number | null;
  probe_5: number | null; probe_10: number | null;
};
export type BondvilleCheck = {
  site: { name: string; lat: number; lon: number };
  method: string;
  probe: { depths_cm: number[]; daily: { date: string; vwc_5: number | null; vwc_10: number | null }[] };
  nisar: BondvilleNisar[];
  summary: { valid_dates: number; dates: number; mean_gap_vs_probe_5cm: number | null };
};

export type ValidationData = {
  intervals: IntervalSummary;
  wells: WellsResponse;
  seasonality: WellSeasonality;
  bondville: BondvilleCheck;
};

const isDate8 = (s: unknown) => typeof s === "string" && /^\d{8}$/.test(s);
const isNumOrNull = (v: unknown) => v === null || (typeof v === "number" && Number.isFinite(v));
const isTwelve = (a: unknown) => Array.isArray(a) && a.length === 12 && a.every((v) => typeof v === "number");

export function validateIntervalSummary(value: unknown): IntervalSummary {
  const m = value as Partial<IntervalSummary> | null;
  if (!m || !Array.isArray(m.intervals) || m.intervals.length === 0) throw new Error("interval_summary.json must contain intervals");
  for (const i of m.intervals) {
    if (!isDate8(i.from) || !isDate8(i.to) || typeof i.paired_pixels !== "number" || typeof i.is_max_rain !== "boolean" ||
        !isNumOrNull(i.rain_in_mean) || !isNumOrNull(i.change_mean) || !isNumOrNull(i.valid_share)) {
      throw new Error("Invalid interval_summary entry");
    }
  }
  if (m.intervals.filter((i) => i.is_max_rain).length !== 1) throw new Error("interval_summary must flag exactly one max-rain interval");
  return m as IntervalSummary;
}

export function validateWellsResponse(value: unknown): WellsResponse {
  const m = value as Partial<WellsResponse> | null;
  if (!m || !Array.isArray(m.wells) || !Array.isArray(m.intervals) || typeof m.flat_threshold_ft !== "number") {
    throw new Error("wells_response.json must contain wells, intervals and flat_threshold_ft");
  }
  for (const w of m.wells) {
    if (typeof w.well !== "string" || typeof w.changes_ft !== "object" || typeof w.class !== "object") throw new Error("Invalid wells_response entry");
    for (const k of m.intervals) {
      if (!isNumOrNull(w.changes_ft[k]) || !(w.class[k] === null || ["rose", "flat", "fell"].includes(String(w.class[k])))) {
        throw new Error(`Invalid change for ${w.well} ${k}`);
      }
    }
  }
  return m as WellsResponse;
}

export function validateWellSeasonality(value: unknown): WellSeasonality {
  const m = value as Partial<WellSeasonality> | null;
  const c = m?.groups?.confined;
  if (!m || !c || !isTwelve(c.monthly_median) || !isTwelve(c.monthly_q25) || !isTwelve(c.monthly_q75) ||
      !m.groups?.unconfined || !m.per_well || !m.storm_window) {
    throw new Error("well_seasonality.json is missing groups, per_well or storm_window");
  }
  for (const v of Object.values(m.per_well)) if (!isTwelve(v.monthly)) throw new Error("per_well curves must have 12 months");
  for (const v of Object.values(m.groups.unconfined.monthly_mean)) if (!isTwelve(v)) throw new Error("unconfined curves must have 12 months");
  return m as WellSeasonality;
}

export function validateBondville(value: unknown): BondvilleCheck {
  const m = value as Partial<BondvilleCheck> | null;
  if (!m || !m.site || !Array.isArray(m.probe?.daily) || !Array.isArray(m.nisar) || !m.summary) {
    throw new Error("bondville_check.json must contain site, probe, nisar and summary");
  }
  for (const n of m.nisar) {
    if (!isDate8(n.date) || typeof n.valid !== "boolean" || !isNumOrNull(n.pixel) || (n.valid && n.pixel === null)) {
      throw new Error("Invalid bondville NISAR entry");
    }
  }
  return m as BondvilleCheck;
}

async function getJson<T>(name: string, validate: (v: unknown) => T, signal: AbortSignal): Promise<T> {
  const response = await fetch(`${import.meta.env.BASE_URL}data/${name}`, { signal });
  if (!response.ok) throw new Error(`${name} HTTP ${response.status}`);
  return validate(await response.json());
}

/** Loads all four validation files; returns null until loaded, and an error message if any fails. */
export function useValidationData(): { data: ValidationData | null; error: string | null } {
  const [data, setData] = useState<ValidationData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      getJson("interval_summary.json", validateIntervalSummary, controller.signal),
      getJson("wells_response.json", validateWellsResponse, controller.signal),
      getJson("well_seasonality.json", validateWellSeasonality, controller.signal),
      getJson("bondville_check.json", validateBondville, controller.signal),
    ]).then(([intervals, wells, seasonality, bondville]) => setData({ intervals, wells, seasonality, bondville }))
      .catch((e: unknown) => { if (!controller.signal.aborted) setError(String(e)); });
    return () => controller.abort();
  }, []);
  return { data, error };
}

export const intervalKey = (from: string, to: string) => `${from}_${to}`;

/** Storm-window counts across wells that have a typical-year comparison. */
export function stormCounts(wells: WellsResponse) {
  const blocks = wells.wells.map((w) => w.storm).filter((s): s is StormBlock => s !== null);
  return {
    n_hist: blocks.length,
    n_beat: blocks.filter((s) => s.beat_typical).length,
    n_rose: blocks.filter((s) => s.y2026_ft > 0).length,
  };
}

/** Rule for the tour: the well with the largest 2026 storm change among those above their typical range. */
export function tourWell(wells: WellsResponse): string | null {
  const above = wells.wells.filter((w) => w.storm?.above_typical_range);
  if (!above.length) return null;
  return above.reduce((a, b) => ((b.storm!.y2026_ft > a.storm!.y2026_ft) ? b : a)).well;
}

"""Build the validation and context JSON files the web app reads.

Writes into app/public/data/:
  interval_summary.json  one entry per NISAR change raster (rain, change, footprint)
  wells_response.json    each candidate well's level change per interval + storm-window context
  bondville_check.json   USCRN probe (Bondville) daily soil moisture next to the NISAR pixel

Inputs, all in the repo:
  app/public/data/nisar_sm_*.tif, nisar_sm_change_*.tif, mrms_precip_*.tif,
  acquisitions.json, precipitation_manifest.json, groundwater_timeseries.json,
  isws_candidate_wells.geojson, well_seasonality.json (delivered ready-made),
  data/probe/CRND0103-2026-IL_Champaign_9_SW.txt (NOAA USCRN daily file).

Deterministic: same inputs, same outputs. Requires numpy, pandas, tifffile, imagecodecs.

    python processing/build_validation_data.py            # from the repo root
    python processing/build_validation_data.py --repo /path/to/IntergalacticHarvester
"""
import argparse
import json
import math
from pathlib import Path

import numpy as np
import pandas as pd
import tifffile

NODATA = -9999.0
CHANGE_EPS = 0.02        # m3/m3; display convention for "wetter"/"drier", not a retrieval error bound
FLAT_THRESHOLD_FT = 0.1  # ft; well change within +/- this counts as "flat"
PROBE_START, PROBE_END = "2026-06-15", "2026-10-20"
BONDVILLE = {"name": "USCRN Champaign 9 SW (Bondville)", "lat": 40.05, "lon": -88.37}

# WGS84 constants for EPSG:6933 (EASE-Grid 2.0 global, cylindrical equal-area, standard parallel 30 N)
A_WGS84 = 6378137.0
E2 = 0.00669437999014
E = math.sqrt(E2)
K0 = math.cos(math.radians(30)) / math.sqrt(1 - E2 * math.sin(math.radians(30)) ** 2)


def _q(sin_lat):
    return (1 - E2) * (sin_lat / (1 - E2 * sin_lat ** 2) - (1 / (2 * E)) * np.log((1 - E * sin_lat) / (1 + E * sin_lat)))


QP = float(_q(1.0 - 1e-15))


def ease_forward(lat, lon):
    return A_WGS84 * K0 * math.radians(lon), A_WGS84 * float(_q(math.sin(math.radians(lat)))) / (2 * K0)


def ease_inverse(x, y):
    """Inverse EPSG:6933 using the authalic-latitude series (sub-metre accuracy at these latitudes)."""
    lon = np.degrees(np.asarray(x) / (A_WGS84 * K0))
    beta = np.arcsin(np.clip(2 * K0 * np.asarray(y) / (A_WGS84 * QP), -1, 1))
    e4, e6 = E2 ** 2, E2 ** 3
    lat = (beta + (E2 / 3 + 31 * e4 / 180 + 517 * e6 / 5040) * np.sin(2 * beta)
           + (23 * e4 / 360 + 251 * e6 / 3780) * np.sin(4 * beta) + (761 * e6 / 45360) * np.sin(6 * beta))
    return np.degrees(lat), lon


def read_tif(path):
    """Return (array, x0, y0, sx, sy): upper-left corner and pixel size from the GeoTIFF tags."""
    with tifffile.TiffFile(path) as t:
        page = t.pages[0]
        arr = page.asarray().astype("float64")
        sx, sy = page.tags["ModelPixelScaleTag"].value[:2]
        tie = page.tags["ModelTiepointTag"].value
    return arr, tie[3], tie[4], sx, sy


def valid(arr):
    return np.isfinite(arr) & (arr != NODATA)


def label(a, b):
    f = lambda d: pd.Timestamp(d).strftime("%b %-d")
    return f"{f(a)} to {f(b)}"


def r(v, n):
    return None if v is None or not np.isfinite(v) else round(float(v), n)


def build_intervals(D):
    acq = json.loads((D / "acquisitions.json").read_text())
    pm = json.loads((D / "precipitation_manifest.json").read_text())
    rain_by = {(p["from"], p["to"]): p for p in pm["intervals"]}
    out = []
    for c in acq["changes"]:
        arr, x0, y0, sx, sy = read_tif(D / c["file"])
        ok = valid(arr)
        n = int(ok.sum())
        if n != c["paired_pixels"]:
            raise SystemExit(f"{c['file']}: {n} valid pixels but acquisitions.json says {c['paired_pixels']}")
        v = arr[ok]
        # MRMS interval raster (inches, interval total) averaged over the MRMS cells under the change footprint.
        p = rain_by[(c["from"], c["to"])]
        m, mx0, my0, msx, msy = read_tif(D / p["file"])
        rows, cols = np.nonzero(ok)
        lat_row, _ = ease_inverse(np.zeros(arr.shape[0]), y0 - (np.arange(arr.shape[0]) + 0.5) * sy)
        _, lon_col = ease_inverse(x0 + (np.arange(arr.shape[1]) + 0.5) * sx, np.zeros(arr.shape[1]))
        mr = np.floor((my0 - lat_row[rows]) / msy).astype(int)
        mc = np.floor((lon_col[cols] - mx0) / msx).astype(int)
        inside = (mr >= 0) & (mr < m.shape[0]) & (mc >= 0) & (mc < m.shape[1])
        cells = np.unique(mr[inside] * m.shape[1] + mc[inside])
        mv = m.ravel()[cells]
        mv = mv[valid(mv) & (mv >= 0)]
        out.append({
            "from": c["from"], "to": c["to"], "label": label(c["from"], c["to"]),
            "days": int((pd.Timestamp(c["to"]) - pd.Timestamp(c["from"])).days),
            "rain_in_mean": r(mv.mean() if mv.size else np.nan, 3),
            "rain_cells": int(mv.size),
            "rain_hours_available": int(p["available_hours"]), "rain_hours_expected": int(p["expected_hours"]),
            "paired_pixels": n, "valid_share": r(n / arr.size, 4),
            "change_mean": r(v.mean(), 4), "change_median": r(np.median(v), 4),
            "change_p10": r(np.percentile(v, 10), 4), "change_p90": r(np.percentile(v, 90), 4),
            "share_wetter": r((v > CHANGE_EPS).mean(), 4), "share_drier": r((v < -CHANGE_EPS).mean(), 4),
        })
    top = max(range(len(out)), key=lambda i: out[i]["rain_in_mean"] or -1)
    for i, o in enumerate(out):
        o["is_max_rain"] = i == top
    return {
        "method": ("Change statistics use only pixels with a valid retrieval on both dates (nodata -9999 excluded); "
                   "valid_share = paired pixels / raster size. Rain is the MRMS interval total (inches, approximate; "
                   "missing hours count as zero) averaged over MRMS cells under the change footprint. "
                   f"Wetter/drier = change beyond +/-{CHANGE_EPS} m3/m3, a display convention."),
        "change_eps": CHANGE_EPS, "units": {"change": "m3/m3", "rain": "inches"},
        "intervals": out,
    }


def daily_levels(well):
    pts = [p for s in well["series"] for p in s["points"] if p[1] is not None and np.isfinite(p[1])]
    if not pts:
        return pd.Series(dtype=float)
    s = pd.Series([p[1] for p in pts], index=pd.to_datetime([p[0] for p in pts], unit="ms")).sort_index()
    s = s[~s.index.duplicated()]
    return s.resample("D").mean().dropna()


def level_on(daily, date):
    """Mean of the daily means for the day before, the day of and the day after (as in the seasonal files)."""
    t = pd.Timestamp(date)
    x = daily[(daily.index >= t - pd.Timedelta(days=1)) & (daily.index <= t + pd.Timedelta(days=1))]
    return float(x.mean()) if len(x) else None


def build_wells(D):
    acq = json.loads((D / "acquisitions.json").read_text())
    gw = json.loads((D / "groundwater_timeseries.json").read_text())["wells"]
    feats = json.loads((D / "isws_candidate_wells.geojson").read_text())["features"]
    storm = {b["well"]: b for b in json.loads((D / "well_seasonality.json").read_text())["storm_window"]["by_well"]}
    keys = [f"{c['from']}_{c['to']}" for c in acq["changes"]]
    wells = []
    for f in feats:
        p = f["properties"]
        w = p["well"]
        daily = daily_levels(gw[w]) if w in gw else pd.Series(dtype=float)
        changes, cls = {}, {}
        for c, k in zip(acq["changes"], keys):
            a, b = level_on(daily, c["from"]), level_on(daily, c["to"])
            ch = None if a is None or b is None else round(b - a, 3)
            changes[k] = ch
            cls[k] = None if ch is None else "rose" if ch > FLAT_THRESHOLD_FT else "fell" if ch < -FLAT_THRESHOLD_FT else "flat"
        sb = storm.get(w)
        lon, lat = f["geometry"]["coordinates"][:2]
        wells.append({
            "well": w, "aquifer": p.get("aquifer"), "aquifer_type": p.get("aquifer_type"),
            "depth_ft": p.get("well_depth"), "lat": round(lat, 5), "lon": round(lon, 5),
            "changes_ft": changes, "class": cls,
            "storm": None if sb is None else {
                "typical_ft": sb["typical_ft"], "q25": sb["q25"], "q75": sb["q75"], "y2026_ft": sb["y2026_ft"],
                "above_typical_range": sb["y2026_ft"] > sb["q75"],
                "beat_typical": sb["y2026_ft"] > sb["typical_ft"]},
        })
    return {
        "units": "ft (unverified; ISWS gwe)", "flat_threshold_ft": FLAT_THRESHOLD_FT,
        "storm_dates": json.loads((D / "well_seasonality.json").read_text())["storm_window"]["dates"],
        "method": ("Level on a date = mean of daily means for the day before, the day of and the day after; "
                   "change = end level minus start level; null when no reading in either window. "
                   "Storm-window comparison is copied from well_seasonality.json (same dates in each well's past years)."),
        "intervals": keys, "wells": wells,
    }


def read_uscrn(path):
    t = pd.read_csv(path, sep=r"\s+", header=None, na_values=[-99.0, -9999.0])
    d = pd.DataFrame({"date": pd.to_datetime(t[1].astype(str), format="%Y%m%d"), "vwc_5": t[18], "vwc_10": t[19]})
    for c in ("vwc_5", "vwc_10"):
        d.loc[d[c] < 0, c] = np.nan
    return d.set_index("date")


def build_bondville(D, probe_file):
    acq = json.loads((D / "acquisitions.json").read_text())
    pr = read_uscrn(probe_file).loc[PROBE_START:PROBE_END]
    x, y = ease_forward(BONDVILLE["lat"], BONDVILLE["lon"])
    nisar = []
    for a in acq["acquisitions"]:
        arr, x0, y0, sx, sy = read_tif(D / a["file"])
        row, col = int((y0 - y) // sy), int((x - x0) // sx)
        ok = valid(arr) & (arr > 0)
        v = arr[row, col] if 0 <= row < arr.shape[0] and 0 <= col < arr.shape[1] else np.nan
        good = bool(np.isfinite(v) and v != NODATA and v > 0)
        day = pd.Timestamp(a["date"])
        probe_row = pr.loc[day] if day in pr.index else None
        nisar.append({"date": a["date"], "pixel": r(v, 4) if good else None, "valid": good,
                      "scene_mean": r(arr[ok].mean(), 4),
                      "probe_5": None if probe_row is None else r(probe_row["vwc_5"], 3),
                      "probe_10": None if probe_row is None else r(probe_row["vwc_10"], 3)})
    gaps = [n["pixel"] - n["probe_5"] for n in nisar if n["valid"] and n["probe_5"] is not None]
    return {
        "site": BONDVILLE,
        "method": ("NISAR value = the single 200 m pixel (EPSG:6933) containing the probe, from the app's soil moisture "
                   "rasters; scene_mean = mean of all valid pixels in that raster. Probe = USCRN daily mean volumetric "
                   "water content at 5 and 10 cm (NOAA NCEI). An earlier comparison also used a Jun 20 pass that is not "
                   "one of the app's nine dates, so it is not included here."),
        "probe": {"depths_cm": [5, 10], "daily": [
            {"date": d.strftime("%Y-%m-%d"), "vwc_5": r(row.vwc_5, 3), "vwc_10": r(row.vwc_10, 3)} for d, row in pr.iterrows()]},
        "nisar": nisar,
        "summary": {"valid_dates": int(sum(n["valid"] for n in nisar)), "dates": len(nisar),
                    "mean_gap_vs_probe_5cm": r(np.mean(gaps), 3) if gaps else None},
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--repo", type=Path, default=Path(__file__).resolve().parents[1])
    ap.add_argument("--probe", type=Path, default=None, help="USCRN daily file (default data/probe/CRND0103-2026-...)")
    a = ap.parse_args()
    D = a.repo / "app" / "public" / "data"
    probe = a.probe or a.repo / "data" / "probe" / "CRND0103-2026-IL_Champaign_9_SW.txt"
    outputs = {"interval_summary.json": build_intervals(D), "wells_response.json": build_wells(D),
               "bondville_check.json": build_bondville(D, probe)}
    for name, obj in outputs.items():
        (D / name).write_text(json.dumps(obj, indent=1, allow_nan=False) + "\n")
        print("wrote", D / name)
    # Test values from the implementation report; print them so a run shows at a glance whether they hold.
    iv = outputs["interval_summary.json"]["intervals"]
    ws = outputs["wells_response.json"]["wells"]
    st = [w["storm"] for w in ws if w["storm"]]
    bv = outputs["bondville_check.json"]
    print("intervals:", len(iv), "| max rain:", [f"{i['from']}-{i['to']}" for i in iv if i["is_max_rain"]])
    print("storm interval mean change:", [i["change_mean"] for i in iv if i["is_max_rain"]], "(footprint: pixels valid on both dates)")
    print("wells:", len(ws), "| with storm block:", len(st), "| y2026 > 0:", sum(s["y2026_ft"] > 0 for s in st),
          "| beat typical:", sum(s["beat_typical"] for s in st))
    print("bondville valid NISAR dates:", bv["summary"]["valid_dates"], "of", bv["summary"]["dates"],
          [n["date"] for n in bv["nisar"] if n["valid"]], "| mean gap vs 5 cm:", bv["summary"]["mean_gap_vs_probe_5cm"])


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Aggregate sparse Illinois MRMS Parquet over Mahomet Aquifer.

Zero-filled outputs are explicitly provisional: absent files/cells may be missing data.
Original MRMS GRIB2 product units are mm, but Parquet conversion is unverified.
"""
import argparse
import json
import re
from collections import defaultdict
from pathlib import Path

import numpy as np
import pandas as pd
import pyarrow.parquet as pq
from shapely import contains_xy
from shapely.geometry import shape
from shapely.ops import unary_union

PATTERN = re.compile(r'^(\d{8})_(\d{6})_.*\.parquet$')

def boundary_geometry(path):
    obj = json.loads(path.read_text(encoding='utf-8'))
    if obj['type'] == 'FeatureCollection':
        return unary_union([shape(f['geometry']) for f in obj['features'] if f.get('geometry')])
    if obj['type'] == 'Feature':
        return shape(obj['geometry'])
    return shape(obj)

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--mrms', type=Path, default=Path(r'../data/raw/mrms'))
    p.add_argument('--boundary', type=Path, default=Path(r'../data/boundaries/mahomet_aquifer.geojson'))
    p.add_argument('--nisar', type=Path, default=Path(r'../data/summaries/fixed_footprint_timeseries.csv'))
    p.add_argument('--out', type=Path, default=Path(r'../data/summaries'))
    p.add_argument('--start', default='2026-06-20')
    p.add_argument('--end', default='2026-10-19', help='Inclusive UTC date')
    p.add_argument('--units', choices=['unknown', 'mm', 'in'], default='unknown',
                   help='Units of Parquet observation; original MRMS is mm, conversion unverified')
    a = p.parse_args()
    a.out.mkdir(parents=True, exist_ok=True)
    geom = boundary_geometry(a.boundary)
    left, bottom, right, top = geom.bounds

    # Native grid cell centers are at .005 degree offsets and 0.01 degree spacing.
    # Use integer grid coordinates to prevent float join errors.
    ix = np.arange(int(np.floor((left - .005) * 100)), int(np.ceil((right - .005) * 100)) + 1)
    iy = np.arange(int(np.floor((bottom - .005) * 100)), int(np.ceil((top - .005) * 100)) + 1)
    xx, yy = np.meshgrid(ix, iy)
    x, y = xx.ravel(), yy.ravel()
    inside = contains_xy(geom, x / 100 + .005, y / 100 + .005)
    x, y = x[inside], y[inside]
    # Geographic grid cells differ in area with latitude; cos(latitude) approximation.
    weights = np.cos(np.deg2rad(y / 100 + .005))
    keys = (y.astype(np.int64) << 32) + x.astype(np.int64)
    order = np.argsort(keys)
    sorted_keys = keys[order]
    weights = weights[order]
    n = len(keys)
    if not n:
        raise SystemExit('No MRMS grid cell centers inside aquifer boundary')
    denom = weights.sum()
    print(f'Aquifer fixed grid: {n:,} cells, {denom:.1f} weighted cells')

    start = pd.Timestamp(a.start, tz='UTC')
    stop = pd.Timestamp(a.end, tz='UTC') + pd.Timedelta(days=1)
    by_time = defaultdict(list)
    for path in a.mrms.rglob('*.parquet'):
        m = PATTERN.match(path.name)
        if not m:
            continue
        ts = pd.Timestamp(m.group(1) + m.group(2), tz='UTC')
        if start <= ts < stop:
            by_time[ts].append(path)
    print(f'{sum(map(len, by_time.values())):,} Parquet files, {len(by_time):,} unique timestamps')

    rows = []
    duplicate_report = []
    failures = []
    for j, (ts, paths) in enumerate(sorted(by_time.items()), 1):
        readings = []
        for path in paths:
            try:
                df = pq.read_table(path, columns=['latitude', 'longitude', 'datetime', 'observation']).to_pandas()
                file_ts = pd.to_datetime(df['datetime'], utc=True)
                if len(df) and (file_ts != ts).any():
                    raise ValueError('data timestamps do not match filename')
                sub = df.loc[df.longitude.between(left - .02, right + .02) &
                             df.latitude.between(bottom - .02, top + .02)]
                lon = sub.longitude.to_numpy(dtype=float)
                lat = sub.latitude.to_numpy(dtype=float)
                obs = sub.observation.to_numpy(dtype=float)
                gx = np.rint((lon - .005) * 100).astype(np.int64)
                gy = np.rint((lat - .005) * 100).astype(np.int64)
                candidate = (gy << 32) + gx
                positions = np.searchsorted(sorted_keys, candidate)
                valid = positions < n
                valid[valid] &= sorted_keys[positions[valid]] == candidate[valid]
                valid &= np.isfinite(obs) & (obs >= 0)
                readings.append((positions[valid], obs[valid], path.name))
            except Exception as exc:
                failures.append({'timestamp_utc': ts.isoformat(), 'file': path.name, 'error': str(exc)})
        if not readings:
            continue
        # Deduplicate repeated hour/file records, but flag conflicting values.
        observed = {}
        conflict = 0
        for pos, vals, name in readings:
            for k, v in zip(pos, vals):
                k = int(k)
                if k in observed and not np.isclose(observed[k], v, atol=1e-5):
                    conflict += 1
                else:
                    observed[k] = float(v)
        if len(paths) > 1:
            duplicate_report.append({'timestamp_utc': ts.isoformat(), 'files': len(paths),
                                     'unique_cells': len(observed), 'conflicting_values': conflict,
                                     'filenames': ';'.join(p.name for p in paths)})
        if observed:
            positions = np.fromiter(observed.keys(), dtype=np.int64)
            vals = np.fromiter(observed.values(), dtype=float)
            mean = float(np.dot(vals, weights[positions]) / denom)
            wet = float(weights[positions[vals > 0]].sum() / denom)
        else:
            mean, wet = 0., 0.
        rows.append({'timestamp_utc': ts, 'file_count': len(paths), 'aquifer_grid_cells': n,
                     'positive_cells': len(observed), 'wet_area_fraction': wet,
                     'mean_zero_filled_raw': mean, 'conflicting_duplicate_values': conflict})
        if j % 500 == 0:
            print(f'Processed {j:,}/{len(by_time):,} hourly timestamps')

    hours = pd.date_range(start, stop - pd.Timedelta(hours=1), freq='h')
    hourly = pd.DataFrame(rows).set_index('timestamp_utc').reindex(hours)
    hourly.index.name = 'timestamp_utc'
    hourly['file_present'] = hourly['file_count'].notna()
    hourly['assumed_zero_raw'] = hourly['mean_zero_filled_raw'].fillna(0.)
    hourly['uncertain_missing_file'] = ~hourly['file_present']
    factor = {'unknown': None, 'mm': 1., 'in': 25.4}[a.units]
    if factor is not None:
        hourly['provisional_mm'] = hourly['assumed_zero_raw'] * factor
    hourly.to_csv(a.out / 'mrms_aquifer_hourly.csv')

    daily = hourly.resample('D').agg(
        hours_with_file=('file_present', 'sum'),
        missing_hours=('uncertain_missing_file', 'sum'),
        provisional_sum_raw=('assumed_zero_raw', 'sum'),
        max_wet_area_fraction=('wet_area_fraction', 'max'),
        total_positive_cell_records=('positive_cells', 'sum'),
    )
    if factor is not None:
        daily['provisional_mm'] = daily.provisional_sum_raw * factor
    daily['complete_hourly_coverage'] = daily.missing_hours.eq(0)
    daily.to_csv(a.out / 'mrms_aquifer_daily.csv', index_label='date_utc')
    pd.DataFrame(duplicate_report).to_csv(a.out / 'mrms_duplicate_hours.csv', index=False)
    pd.DataFrame(failures).to_csv(a.out / 'mrms_read_errors.csv', index=False)

    if a.nisar.exists():
        nisar = pd.read_csv(a.nisar)
        if 'date' in nisar.columns:
            time_col = next((c for c in ['acquisition_utc', 'acquisition_time_utc', 'timestamp_utc']
                             if c in nisar.columns), None)
            if time_col:
                times = pd.to_datetime(nisar[time_col], utc=True, errors='coerce')
                time_quality = 'actual acquisition timestamps from CSV'
            else:
                times = pd.to_datetime(nisar['date'], utc=True, errors='coerce')
                time_quality = 'UTC midnight proxies (NOT acquisition times)'
            intervals = []
            for prev, curr in zip(times[:-1], times[1:]):
                if pd.isna(prev) or pd.isna(curr):
                    continue
                # Hour ending at ts covers (ts-1h, ts]. Include only complete hours.
                mask = (hourly.index >= prev + pd.Timedelta(hours=1)) & (hourly.index <= curr)
                h = hourly.loc[mask]
                intervals.append({'from_utc': prev.isoformat(), 'to_utc': curr.isoformat(),
                                  'time_basis': time_quality,
                                  'included_complete_hours': len(h),
                                  'hours_without_file': int(h.uncertain_missing_file.sum()),
                                  'provisional_sum_raw': h.assumed_zero_raw.sum(),
                                  'provisional_mm': h.assumed_zero_raw.sum() * factor if factor is not None else np.nan,
                                  'all_hours_have_files': bool(h.file_present.all())})
            pd.DataFrame(intervals).to_csv(a.out / 'mrms_nisar_intervals.csv', index=False)
            print('NISAR interval time basis:', time_quality)

    print('Daily missing-file hours:', int(daily.missing_hours.sum()))
    print('Duplicate hours:', len(duplicate_report), 'Read errors:', len(failures))
    print('Units:', a.units, '(unknown means raw values only)')
    print('Outputs:', a.out)
    print('WARNING: All zero-filled totals are PROVISIONAL. Missing files and cells are not proven dry.')

if __name__ == '__main__':
    main()

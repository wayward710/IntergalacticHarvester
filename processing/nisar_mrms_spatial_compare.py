#!/usr/bin/env python3
"""Map MRMS rainfall vs NISAR surface-moisture change, July 26–Aug 19, 2026.

MRMS inches and missing-as-zero are provisional assumptions. Spatial correlation
is descriptive; NISAR pixels sharing one MRMS cell are NOT independent samples.
"""
import argparse
import json
import re
from collections import defaultdict
from pathlib import Path

import h5py
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import pyarrow.parquet as pq
from scipy.spatial import cKDTree
from shapely import contains_xy
from shapely.geometry import shape
from shapely.ops import unary_union

BASE = 'science/LSAR/SME2/grids'
START = pd.Timestamp('2026-07-26T00:50:41Z')
END = pd.Timestamp('2026-08-19T00:50:40Z')


def geometry(path):
    obj = json.loads(path.read_text(encoding='utf-8'))
    if obj['type'] == 'FeatureCollection':
        return unary_union([shape(f['geometry']) for f in obj['features'] if f.get('geometry')])
    return shape(obj['geometry'] if obj['type'] == 'Feature' else obj)


def find_scene(folder, date):
    files = sorted(folder.rglob(f'NISAR_L3_PR_SME2_*_084_D_068_2005_*{date}T*_P05023_*.h5'))
    if len(files) != 1:
        raise RuntimeError(f'Expected one matching NISAR scene for {date}, found {len(files)}: {files[:4]}')
    return files[0]


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--root', type=Path, default=Path(r'../data/raw'))
    p.add_argument('--mrms', type=Path)
    p.add_argument('--boundary', type=Path)
    p.add_argument('--count-mask', type=Path)
    p.add_argument('--out', type=Path)
    p.add_argument('--units', choices=['in', 'mm'], default='in', help='Parquet observation units, provisional')
    a = p.parse_args()
    mrms = a.mrms or a.root / 'mrms' / '2026'
    boundary = a.boundary or a.root / 'nisar_coverage' / 'mahomet_aquifer.geojson'
    count_path = a.count_mask or a.root / 'nisar_coverage' / 'recommended_observation_count.npy'
    out = a.out or a.root / 'mrms' / 'analysis' / 'spatial_jul26_aug19'
    out.mkdir(parents=True, exist_ok=True)
    geom = geometry(boundary)

    scenes = [find_scene(a.root, date) for date in ('20260726', '20260819')]
    grids = []
    for scene in scenes:
        with h5py.File(scene, 'r') as f:
            g = f[BASE]
            lat, lon = g['latitude'][:], g['longitude'][:]
            sm = g['soilMoisture'][:]
            q = g['retrievalQualityFlag'][:]
            valid = np.isfinite(sm) & (sm >= 0) & (sm <= 0.6) & (q != -9999) & ((q.astype('int32') & 1) == 0)
            grids.append((lat, lon, sm, valid))
    lat, lon = grids[0][:2]
    if not (np.array_equal(lat, grids[1][0]) and np.array_equal(lon, grids[1][1])):
        raise RuntimeError('NISAR scene grids differ')
    counts = np.load(count_path)
    if counts.shape != grids[0][2].shape:
        raise RuntimeError('Fixed-footprint count mask has incorrect shape')
    common = (counts == 9) & grids[0][3] & grids[1][3]
    if common.sum() == 0:
        raise RuntimeError('No common NISAR pixels')
    delta = np.full(common.shape, np.nan, dtype=np.float32)
    delta[common] = grids[1][2][common] - grids[0][2][common]
    print(f'NISAR fixed-footprint pixels: {common.sum():,}; mean change: {np.nanmean(delta):.5f} m3/m3')

    # MRMS 0.01-degree grid: center coordinates end in .005 degrees.
    west, south, east, north = geom.bounds
    ix = np.arange(int(np.floor((west - .005) * 100)), int(np.ceil((east - .005) * 100)) + 1)
    iy = np.arange(int(np.floor((south - .005) * 100)), int(np.ceil((north - .005) * 100)) + 1)
    xx, yy = np.meshgrid(ix, iy)
    mx, my = xx.ravel(), yy.ravel()
    inside = contains_xy(geom, mx / 100 + .005, my / 100 + .005)
    mx, my = mx[inside], my[inside]
    keys = (my.astype('int64') << 32) + mx.astype('int64')
    order = np.argsort(keys)
    keys, mx, my = keys[order], mx[order], my[order]
    rain = np.zeros(len(keys), dtype='float64')
    present_hours = set()
    errors = []
    by_hour = defaultdict(list)
    for f in mrms.rglob('*.parquet'):
        match = re.match(r'(\d{8})_(\d{6})_', f.name)
        if not match:
            continue
        ts = pd.Timestamp(match.group(1) + match.group(2), tz='UTC')
        # Hour timestamp is end of accumulation interval. Use complete hours.
        if START + pd.Timedelta(hours=1) <= ts <= END:
            by_hour[ts].append(f)
    print(f'MRMS unique hourly timestamps: {len(by_hour)}')
    for n, (ts, files) in enumerate(sorted(by_hour.items()), 1):
        cell_values = {}
        for f in files:
            try:
                tab = pq.read_table(f, columns=['latitude', 'longitude', 'observation']).to_pandas()
                tab = tab[tab.latitude.between(south-.02, north+.02) & tab.longitude.between(west-.02, east+.02)]
                gx = np.rint((tab.longitude.to_numpy() - .005) * 100).astype('int64')
                gy = np.rint((tab.latitude.to_numpy() - .005) * 100).astype('int64')
                candidate = (gy << 32) + gx
                pos = np.searchsorted(keys, candidate)
                ok = pos < len(keys)
                ok[ok] &= keys[pos[ok]] == candidate[ok]
                vals = tab.observation.to_numpy(dtype='float64')
                ok &= np.isfinite(vals) & (vals >= 0)
                for idx, val in zip(pos[ok], vals[ok]):
                    idx = int(idx)
                    if idx in cell_values and not np.isclose(cell_values[idx], val, atol=1e-5):
                        errors.append(f'Conflicting duplicate at {ts} cell {idx}')
                    else:
                        cell_values[idx] = float(val)
            except Exception as exc:
                errors.append(f'{f.name}: {exc}')
        if cell_values:
            idx = np.fromiter(cell_values.keys(), dtype=int)
            rain[idx] += np.fromiter(cell_values.values(), dtype=float)
        present_hours.add(ts)
        if n % 100 == 0:
            print(f'  {n}/{len(by_hour)} hours')
    if errors:
        (out / 'mrms_errors.txt').write_text('\n'.join(errors), encoding='utf-8')
        raise RuntimeError(f'{len(errors)} MRMS errors or conflicts; see {out / "mrms_errors.txt"}')
    expected = len(pd.date_range(START + pd.Timedelta(hours=1), END, freq='h'))
    missing = expected - len(present_hours)
    if a.units == 'mm':
        rain /= 25.4
    print(f'MRMS hours: {len(present_hours)} files, {missing} without; missing hours treated as zero (provisional)')
    print(f'MRMS area-weighted aquifer mean: {np.average(rain, weights=np.cos(np.deg2rad(my/100+.005))):.3f} provisional inches')

    # Match NISAR fixed-footprint pixels to nearest MRMS grid cell; use MRMS
    # grid cells as statistical units to avoid pseudoreplication.
    rr, cc = np.where(common)
    nlat, nlon = lat[rr], lon[cc]
    # Local planar approximation to degrees for nearest-center matching.
    scale = np.cos(np.deg2rad(np.mean(nlat)))
    tree = cKDTree(np.column_stack(((mx/100+.005)*scale, my/100+.005)))
    dist, nearest = tree.query(np.column_stack((nlon*scale, nlat)), workers=-1)
    # Exclude NISAR pixels farther than ~one MRMS grid diagonal.
    matched = dist <= 0.009
    groups = nearest[matched]
    changes = delta[rr[matched], cc[matched]]
    count = np.bincount(groups, minlength=len(keys))
    change_sum = np.bincount(groups, weights=changes, minlength=len(keys))
    avg_change = np.full(len(keys), np.nan)
    good = count > 0
    avg_change[good] = change_sum[good] / count[good]
    matched_df = pd.DataFrame({'latitude': my[good]/100+.005, 'longitude': mx[good]/100+.005,
                               'rain_provisional_inches': rain[good],
                               'mean_nisar_change_m3_m3': avg_change[good],
                               'nisar_pixel_count': count[good]})
    matched_df.to_csv(out / 'mrms_cell_nisar_comparison.csv', index=False)
    corr = matched_df[['rain_provisional_inches','mean_nisar_change_m3_m3']].corr().iloc[0,1]
    print(f'Matched MRMS cells: {good.sum():,}; Pearson r (descriptive): {corr:.3f}')
    print(f'Paired NISAR pixels: {matched.sum():,} / {common.sum():,}')

    # Build MRMS raster (cells outside boundary masked), for map display.
    raster = np.full(xx.shape, np.nan)
    raster[my-iy[0], mx-ix[0]] = rain
    fig, ax = plt.subplots(figsize=(10, 5.6))
    im = ax.imshow(raster, origin='lower', extent=(ix[0]/100, (ix[-1]+1)/100, iy[0]/100, (iy[-1]+1)/100),
                   cmap='Blues', interpolation='nearest')
    ax.set(xlabel='Longitude', ylabel='Latitude', title='MRMS accumulated rainfall, Jul 26–Aug 19, 2026\nProvisional inches; missing hours assumed dry')
    fig.colorbar(im, ax=ax, label='Accumulated precipitation (provisional inches)')
    fig.tight_layout(); fig.savefig(out / 'mrms_rainfall_map.png', dpi=170); plt.close(fig)

    fig, ax = plt.subplots(figsize=(10, 5.6))
    lim = max(.05, float(np.nanpercentile(np.abs(delta), 98)))
    im = ax.imshow(delta, origin='upper' if lat[0]>lat[-1] else 'lower',
                   extent=(lon.min(),lon.max(),lat.min(),lat.max()),
                   cmap='RdBu', vmin=-lim, vmax=lim, interpolation='nearest')
    ax.set(xlim=(west,east), ylim=(south,north), xlabel='Longitude', ylabel='Latitude',
           title='NISAR soil-moisture change, Jul 26–Aug 19, 2026\nOnly pixels recommended on all nine acquisition dates')
    fig.colorbar(im, ax=ax, label='Soil moisture change (m³/m³)')
    fig.tight_layout(); fig.savefig(out / 'nisar_change_map.png', dpi=170); plt.close(fig)

    fig, ax = plt.subplots(figsize=(8, 5.5))
    hb = ax.hexbin(matched_df.rain_provisional_inches, matched_df.mean_nisar_change_m3_m3,
                   gridsize=45, mincnt=1, cmap='viridis')
    fig.colorbar(hb, ax=ax, label='Number of MRMS grid cells')
    ax.axhline(0, color='gray', linewidth=.8)
    ax.set(xlabel='MRMS accumulated rainfall (provisional inches)',
           ylabel='Mean NISAR change per MRMS cell (m³/m³)',
           title=f'Rainfall vs soil-moisture change (r={corr:.2f}, {good.sum():,} grid cells)')
    fig.tight_layout(); fig.savefig(out / 'rainfall_vs_nisar_hexbin.png', dpi=170); plt.close(fig)

    summary = {'start_utc': START.isoformat(), 'end_utc': END.isoformat(),
               'mrms_hours_with_file': len(present_hours), 'mrms_hours_without_file': missing,
               'mrms_units_assumed': a.units, 'missing_hour_assumption': 'zero, not validated',
               'mrms_grid_cells_inside_aquifer': len(keys), 'matched_mrms_cells': int(good.sum()),
               'nisar_common_pixels': int(common.sum()), 'matched_nisar_pixels': int(matched.sum()),
               'nisar_mean_change_m3_m3': float(np.nanmean(delta)),
               'pearson_r_mrms_cell_level': float(corr)}
    (out / 'summary.json').write_text(json.dumps(summary, indent=2), encoding='utf-8')
    print('Wrote maps, scatterplot, grid-cell CSV and summary to', out)

if __name__ == '__main__':
    main()

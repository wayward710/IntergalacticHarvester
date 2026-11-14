"""Compare July–October 2026 NISAR SME2 on the SAME quality-filtered pixels.

Run: python nisar_fixed_footprint.py --folder ../data/raw
Requires: numpy, pandas, h5py, matplotlib
Uses nisar_coverage/recommended_observation_count.npy from prior coverage script.
"""
import argparse
import re
from pathlib import Path

import h5py
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt

BASE = 'science/LSAR/SME2/grids'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--folder', type=Path, default=Path(r'../data/raw'))
    args = parser.parse_args()
    folder = args.folder
    out = folder / 'nisar_coverage'
    out.mkdir(exist_ok=True)

    acquisitions = []
    for p in folder.glob('*.h5'):
        if '_084_D_068_2005_' not in p.name or '_P05023_' not in p.name:
            continue
        match = re.search(r'_(20\d{6})T\d{6}_', p.name)
        if match and '20260702' <= match.group(1) <= '20261018':
            acquisitions.append((match.group(1), p))
    acquisitions.sort()
    if len(acquisitions) != 9:
        raise RuntimeError(f'Expected 9 acquisitions; found {len(acquisitions)}')

    count_path = out / 'recommended_observation_count.npy'
    if not count_path.exists():
        raise FileNotFoundError(f'Run nisar_mahomet_coverage.py first: {count_path}')
    counts = np.load(count_path, allow_pickle=False)
    common = counts == len(acquisitions)
    n = int(common.sum())
    if n == 0:
        raise RuntimeError('No pixels with recommended observations on all nine dates')
    print(f'Fixed common footprint: {n:,} pixels')

    dates = []
    common_values = []
    lat_ref = lon_ref = None
    for date, path in acquisitions:
        with h5py.File(path, 'r') as h5:
            g = h5[BASE]
            lat, lon = g['latitude'][:], g['longitude'][:]
            if lat_ref is None:
                lat_ref, lon_ref = lat, lon
            elif not np.array_equal(lat, lat_ref) or not np.array_equal(lon, lon_ref):
                raise ValueError(f'Grid mismatch: {path.name}')
            sm = g['soilMoisture'][:]
            q = g['retrievalQualityFlag'][:]
            fill = g['soilMoisture'].attrs.get('_FillValue', -9999)
            qfill = g['retrievalQualityFlag'].attrs.get('_FillValue', -9999)
            good = (np.isfinite(sm) & (sm != fill) & (sm >= 0) & (sm <= 0.6)
                    & (q != qfill) & ((q.astype(np.int32) & 1) == 0))
            if sm.shape != common.shape or not np.all(good[common]):
                raise ValueError(f'Quality-mask mismatch on {date}; rerun coverage script')
            values = sm[common].astype(np.float32)
        dates.append(pd.to_datetime(date, format='%Y%m%d'))
        common_values.append(values)
        print(date, f'mean={values.mean():.4f}, median={np.median(values):.4f}')

    stack = np.stack(common_values, axis=0)
    summary = []
    for i, date in enumerate(dates):
        vals = stack[i]
        row = {'date': date.date().isoformat(), 'common_pixels': n,
               'mean_m3_m3': float(vals.mean()), 'median_m3_m3': float(np.median(vals)),
               'p10_m3_m3': float(np.percentile(vals, 10)),
               'p90_m3_m3': float(np.percentile(vals, 90))}
        if i:
            delta = vals - stack[i - 1]
            row.update({'days_since_previous': (date - dates[i-1]).days,
                        'mean_pixel_change_m3_m3': float(delta.mean()),
                        'median_pixel_change_m3_m3': float(np.median(delta)),
                        'fraction_pixels_wetter': float(np.mean(delta > 0))})
        summary.append(row)
    pd.DataFrame(summary).to_csv(out / 'fixed_footprint_timeseries.csv', index=False)

    fig, ax = plt.subplots(figsize=(9, 4.8))
    ax.plot(dates, [x['mean_m3_m3'] for x in summary], marker='o', label='Mean')
    ax.plot(dates, [x['median_m3_m3'] for x in summary], marker='s', label='Median')
    ax.set(xlabel='Acquisition date', ylabel='Surface soil moisture (m³/m³)',
           title=f'NISAR Mahomet fixed-footprint soil moisture ({n:,} pixels)')
    ax.legend()
    ax.grid(alpha=0.25)
    fig.autofmt_xdate()
    fig.tight_layout()
    fig.savefig(out / 'fixed_footprint_timeseries.png', dpi=170)
    plt.close(fig)

    # Spatial changes on identical pixels, with missing pixels left transparent.
    # Store only consecutive-interval maps; each difference is spatially paired.
    for i in range(1, len(dates)):
        with h5py.File(acquisitions[i][1], 'r') as h5_new, h5py.File(acquisitions[i-1][1], 'r') as h5_old:
            a = h5_new[BASE + '/soilMoisture'][:]
            b = h5_old[BASE + '/soilMoisture'][:]
        diff = np.full(common.shape, np.nan, dtype=np.float32)
        diff[common] = a[common] - b[common]
        fig, ax = plt.subplots(figsize=(10, 5))
        lim = max(0.05, float(np.percentile(np.abs(diff[common]), 98)))
        im = ax.imshow(diff, extent=(lon_ref.min(), lon_ref.max(), lat_ref.min(), lat_ref.max()),
                       origin='upper' if lat_ref[0] > lat_ref[-1] else 'lower',
                       vmin=-lim, vmax=lim, cmap='RdBu', interpolation='nearest')
        ax.set(xlim=(-90.4, -87.4), ylim=(39.85, 40.95), xlabel='Longitude', ylabel='Latitude',
               title=f'NISAR change: {dates[i-1]:%b %d} to {dates[i]:%b %d, %Y}')
        fig.colorbar(im, ax=ax, label='Soil moisture change (m³/m³)')
        fig.tight_layout()
        fig.savefig(out / f'change_{dates[i-1]:%Y%m%d}_{dates[i]:%Y%m%d}.png', dpi=150)
        plt.close(fig)

    print(f'Finished: {out}')
    print('Upload fixed_footprint_timeseries.csv and fixed_footprint_timeseries.png for review.')


if __name__ == '__main__':
    main()

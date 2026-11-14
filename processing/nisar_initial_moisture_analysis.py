#!/usr/bin/env python3
"""Initial NISAR moisture vs July 26–Aug 19 change; exploratory diagnostics.

Uses nine-date common recommended-quality mask. Decile change comparisons
are mathematically coupled to baseline; interpret alongside final moisture.
"""
import argparse
import json
from pathlib import Path

import h5py
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from scipy.spatial import cKDTree

BASE = 'science/LSAR/SME2/grids'


def scene(root, day):
    matches = sorted(root.rglob(f'NISAR_L3_PR_SME2_*_084_D_068_2005_*{day}T*_P05023_*.h5'))
    if len(matches) != 1:
        raise RuntimeError(f'Expected one scene for {day}, found {len(matches)}: {matches[:3]}')
    return matches[0]


def read(path):
    with h5py.File(path) as f:
        g = f[BASE]
        sm = g['soilMoisture'][:]
        q = g['retrievalQualityFlag'][:]
        good = np.isfinite(sm) & (sm >= 0) & (sm <= .6) & (q != -9999) & ((q.astype('int32') & 1) == 0)
        return sm, good, g['latitude'][:], g['longitude'][:]


def deciles(frame, key='initial'):
    frame = frame.copy()
    frame['decile'] = pd.qcut(frame[key].rank(method='first'), 10, labels=False) + 1
    result = frame.groupby('decile', observed=True).agg(
        n=('initial', 'size'), initial_median=('initial', 'median'),
        final_median=('final', 'median'), change_median=('change', 'median'),
        change_mean=('change', 'mean'), change_q25=('change', lambda s: s.quantile(.25)),
        change_q75=('change', lambda s: s.quantile(.75)),
        fraction_wetter=('change', lambda s: (s > 0).mean())
    ).reset_index()
    return result


def plot_deciles(d, path, label):
    fig, axes = plt.subplots(1, 2, figsize=(12, 4.6))
    x = d['initial_median'].to_numpy()
    axes[0].plot(x, d['change_median'], marker='o')
    axes[0].fill_between(x, d['change_q25'], d['change_q75'], alpha=.2)
    axes[0].axhline(0, color='gray', lw=.8)
    axes[0].set(xlabel='July 26 initial soil moisture (m³/m³)', ylabel='Aug 19 − Jul 26 (m³/m³)',
                title='Change by initial-moisture decile\nMedian and interquartile range')
    axes[1].plot(x, d['initial_median'], marker='o', label='July 26')
    axes[1].plot(x, d['final_median'], marker='o', label='August 19')
    axes[1].set(xlabel='July 26 initial soil moisture (m³/m³)', ylabel='Soil moisture (m³/m³)',
                title='Initial and final moisture by decile')
    axes[1].legend()
    fig.suptitle(label)
    fig.tight_layout()
    fig.savefig(path, dpi=170)
    plt.close(fig)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--root', type=Path, default=Path(r'../data/raw'))
    p.add_argument('--mask', type=Path)
    p.add_argument('--mrms-cells', type=Path, help='Optional previous spatial comparison CSV')
    p.add_argument('--out', type=Path)
    a = p.parse_args()
    out = a.out or a.root / 'mrms' / 'analysis' / 'initial_moisture'
    out.mkdir(parents=True, exist_ok=True)
    mask_file = a.mask or a.root / 'nisar_coverage' / 'recommended_observation_count.npy'
    first, first_good, lat, lon = read(scene(a.root, '20260726'))
    last, last_good, lat2, lon2 = read(scene(a.root, '20260819'))
    if not (np.array_equal(lat, lat2) and np.array_equal(lon, lon2)):
        raise RuntimeError('Scene coordinates do not match')
    counts = np.load(mask_file)
    if counts.shape != first.shape:
        raise RuntimeError('Common-footprint mask shape does not match scene')
    valid = (counts == 9) & first_good & last_good
    rr, cc = np.where(valid)
    df = pd.DataFrame({'latitude': lat[rr], 'longitude': lon[cc],
                       'initial': first[valid].astype(float), 'final': last[valid].astype(float)})
    df['change'] = df['final'] - df['initial']
    if df.empty:
        raise RuntimeError('No valid common-footprint pixels')
    d = deciles(df)
    d.to_csv(out / 'initial_moisture_deciles_pixels.csv', index=False)
    plot_deciles(d, out / 'initial_moisture_deciles_pixels.png', f'NISAR common-footprint pixels (n={len(df):,})')
    summary = {'nisar_pixels': int(len(df)), 'initial_mean': float(df.initial.mean()),
               'final_mean': float(df.final.mean()), 'change_mean': float(df.change.mean()),
               'fraction_wetter': float((df.change > 0).mean()),
               'initial_change_pearson_r_pixels_coupled': float(df[['initial','change']].corr().iloc[0,1]),
               'initial_final_pearson_r_pixels': float(df[['initial','final']].corr().iloc[0,1])}
    print('NISAR pixel deciles:')
    print(d[['decile','n','initial_median','final_median','change_median','fraction_wetter']].to_string(index=False))
    print('\nWARNING: initial vs (final-initial) correlations are mathematically coupled.')
    cell_path = a.mrms_cells or a.root / 'mrms' / 'analysis' / 'spatial_jul26_aug19' / 'mrms_cell_nisar_comparison.csv'
    if cell_path.exists():
        cells = pd.read_csv(cell_path)
        # Match each NISAR pixel to nearest MRMS center, consistent with previous script.
        scale = np.cos(np.deg2rad(df.latitude.mean()))
        tree = cKDTree(np.column_stack((cells.longitude.to_numpy()*scale, cells.latitude.to_numpy())))
        dist, idx = tree.query(np.column_stack((df.longitude.to_numpy()*scale, df.latitude.to_numpy())), workers=-1)
        use = dist <= .009
        matched = df.loc[use, ['initial','final','change']].copy()
        matched['cell_id'] = idx[use]
        grouped = matched.groupby('cell_id').agg(initial=('initial','mean'), final=('final','mean'),
                                                  change=('change','mean'), pixel_count=('change','size'))
        grouped = grouped.join(cells[['latitude','longitude','rain_provisional_inches']])
        grouped.to_csv(out / 'initial_moisture_mrms_cells.csv', index=False)
        dc = deciles(grouped)
        dc.to_csv(out / 'initial_moisture_deciles_mrms_cells.csv', index=False)
        plot_deciles(dc, out / 'initial_moisture_deciles_mrms_cells.png',
                     f'MRMS grid-cell means (n={len(grouped):,}); equal cell weight')
        summary['matched_mrms_cells'] = int(len(grouped))
        summary['initial_change_pearson_r_cells_coupled'] = float(grouped[['initial','change']].corr().iloc[0,1])
        summary['initial_final_pearson_r_cells'] = float(grouped[['initial','final']].corr().iloc[0,1])
        print('\nMRMS-cell deciles:')
        print(dc[['decile','n','initial_median','final_median','change_median']].to_string(index=False))
    else:
        print(f'Optional MRMS comparison CSV not found: {cell_path}; skipped cell aggregation')
    (out / 'summary.json').write_text(json.dumps(summary, indent=2), encoding='utf-8')
    print('\nSaved results to', out)


if __name__ == '__main__':
    main()

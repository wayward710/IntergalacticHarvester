#!/usr/bin/env python3
"""July–October NISAR temporal comparison using FIXED 2025 CDL labels.

The source Parquet contains pixels selected as valid for Sep 12 and Sep 24;
therefore the candidate universe is selection-biased toward that interval.
Pairwise and all-date cohorts are both reported. No causal crop inference.
"""
from pathlib import Path
import re
import h5py
import numpy as np
import pandas as pd

ROOT = Path(r'../data/raw')
BASE = 'science/LSAR/SME2/grids'
INPUT = ROOT / 'nisar_coverage' / 'cdl_analysis' / 'nisar_cdl_pixels_20260912_20260924.parquet'
OUT = ROOT / 'nisar_coverage' / 'cdl_analysis' / 'multi_interval'
OUT.mkdir(parents=True, exist_ok=True)
DATES = ['20260702','20260714','20260726','20260819','20260831',
         '20260912','20260924','20261006','20261018']
BACKSCATTER = {'hh': 'radarData/frequencyA/sigma0HH',
               'hv': 'radarData/frequencyA/sigma0HV'}


def scene_for(date):
    matches = sorted(ROOT.glob(f'NISAR_L3_PR_SME2_*_084_D_068_2005_*_A_{date}T*_P05023_*.h5'))
    if len(matches) != 1:
        raise RuntimeError(f'Expected one descending acquisition on {date}, found: {matches}')
    return matches[0]


def read_selected(dataset, rr, cc):
    # Reading entire ~14 MB raster avoids h5py fancy-index ordering restrictions.
    a = dataset[:]
    v = np.asarray(a[rr, cc], dtype=np.float64)
    fill = dataset.attrs.get('_FillValue')
    if fill is not None:
        v[v == np.asarray(fill).reshape(-1)[0]] = np.nan
    v[~np.isfinite(v)] = np.nan
    return v


def weighted_crop_comparison(frame, metric, min_each=5):
    """Equal-area 5-km blocks; overlap weighting, one difference per block."""
    g = (frame.groupby(['cell_x','cell_y','dominant_cover'])[metric]
         .agg(['mean','count']).reset_index())
    w = g.pivot(index=['cell_x','cell_y'], columns='dominant_cover', values=['mean','count'])
    needed = [('mean','corn'),('mean','soybeans'),('count','corn'),('count','soybeans')]
    if any(c not in w.columns for c in needed):
        return np.nan, 0, np.nan
    w = w.dropna(subset=needed)
    w = w[(w[('count','corn')] >= min_each) & (w[('count','soybeans')] >= min_each)]
    if len(w) == 0:
        return np.nan, 0, np.nan
    diff = w[('mean','soybeans')] - w[('mean','corn')]
    weight = np.minimum(w[('count','corn')], w[('count','soybeans')])
    return float(np.average(diff, weights=weight)), len(w), float((diff > 0).mean())


def main():
    df = pd.read_parquet(INPUT)
    df = df[df['dominant_cover'].isin(['corn','soybeans'])].copy().reset_index(drop=True)
    rr = df['row'].to_numpy(dtype=np.intp)
    cc = df['col'].to_numpy(dtype=np.intp)
    df['cell_x'] = np.floor(df['x_6933'] / 5000).astype(int)
    df['cell_y'] = np.floor(df['y_6933'] / 5000).astype(int)
    n = len(df)
    print(f'Candidate pixels: {n:,} (selected from Sep 12–24 paired-valid dataset)')

    sm = {}; back = {'hh': {}, 'hv': {}}
    valid = {}
    for date in DATES:
        path = scene_for(date)
        print('Reading', date, path.name, flush=True)
        with h5py.File(path, 'r') as f:
            g = f[BASE]
            v = read_selected(g['soilMoisture'], rr, cc)
            flags = read_selected(g['retrievalQualityFlag'], rr, cc)
            recommended = (np.isfinite(flags) & (flags >= 0) &
                           ((np.nan_to_num(flags, nan=1).astype(np.int32) & 1) == 0))
            valid[date] = np.isfinite(v) & (v >= 0) & (v <= .6) & recommended
            sm[date] = v
            for pol, key in BACKSCATTER.items():
                if key not in g:
                    print(f'  WARNING: {key} unavailable; {pol} will be NaN')
                    back[pol][date] = np.full(n, np.nan)
                    continue
                ds = g[key]
                unit = ds.attrs.get('units', 'not specified')
                print(f'  {pol} units: {unit}')
                values = read_selected(ds, rr, cc)
                # These product fields were treated as LINEAR sigma0 in prior analysis.
                # Do not silently apply dB conversion to nonpositive or already-dB data.
                back[pol][date] = np.where(values > 0, 10 * np.log10(np.maximum(values, 1e-30)), np.nan)

    all_valid = np.logical_and.reduce([valid[d] for d in DATES])
    print(f'All-nine-acquisition valid cohort: {all_valid.sum():,} / {n:,}')
    rows = []
    for start, end in zip(DATES[:-1], DATES[1:]):
        for cohort_name, mask in [('pairwise', valid[start] & valid[end]),
                                  ('all_nine', all_valid)]:
            sub = df.loc[mask, ['dominant_cover','cell_x','cell_y']].copy()
            sub['delta_sm'] = sm[end][mask] - sm[start][mask]
            for pol in BACKSCATTER:
                sub[f'delta_{pol}_db'] = back[pol][end][mask] - back[pol][start][mask]
            for metric in ['delta_sm', 'delta_hh_db', 'delta_hv_db']:
                for crop in ['corn','soybeans']:
                    vals = sub.loc[sub['dominant_cover'].eq(crop), metric].dropna()
                    rows.append({'start':start,'end':end,'cohort':cohort_name,
                                 'metric':metric,'crop':crop,'n_pixels':len(vals),
                                 'mean':vals.mean() if len(vals) else np.nan,
                                 'median':vals.median() if len(vals) else np.nan,
                                 'within_cell_diff':np.nan,'matched_cells':np.nan,
                                 'fraction_positive_cells':np.nan})
                diff, cells, fraction = weighted_crop_comparison(sub, metric)
                rows.append({'start':start,'end':end,'cohort':cohort_name,
                             'metric':metric,'crop':'soybean_minus_corn',
                             'n_pixels':sub[metric].notna().sum(),
                             'mean':np.nan,'median':np.nan,
                             'within_cell_diff':diff,'matched_cells':cells,
                             'fraction_positive_cells':fraction})

    result = pd.DataFrame(rows)
    result.to_csv(OUT / 'multi_interval_summary.csv', index=False)
    print('\nWithin-cell soybean-minus-corn changes:')
    print(result[(result['crop']=='soybean_minus_corn') &
                 (result['metric']=='delta_sm')][
        ['start','end','cohort','n_pixels','within_cell_diff','matched_cells','fraction_positive_cells']
    ].to_string(index=False))
    print('\nSaved:', OUT / 'multi_interval_summary.csv')
    print('NOTE: Candidate pixels are conditioned on Sep 12–24 valid retrievals.')
    print('NOTE: Check HDF5 sigma0 units before interpreting dB changes.')


if __name__ == '__main__':
    main()

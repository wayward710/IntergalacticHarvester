#!/usr/bin/env python3
"""Compare NISAR soil moisture across eight consecutive same-track acquisitions.

Outputs interval summary, initial-moisture deciles, and overview charts.
Correlations of initial with change are mathematically coupled: descriptive only.
"""
import argparse
import json
from pathlib import Path
import h5py
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt

BASE = 'science/LSAR/SME2/grids'
DATES = ['20260702','20260714','20260726','20260819','20260831',
         '20260912','20260924','20261006','20261018']

def find_scene(root, day):
    found = sorted(root.rglob(f'NISAR_L3_PR_SME2_*_084_D_068_2005_*{day}T*_P05023_*.h5'))
    if len(found) != 1:
        raise RuntimeError(f'{day}: expected exactly one matching scene; found {len(found)}: {found[:3]}')
    return found[0]

def read_scene(path):
    with h5py.File(path) as f:
        g = f[BASE]
        sm = g['soilMoisture'][:]
        q = g['retrievalQualityFlag'][:]
        valid = np.isfinite(sm) & (sm >= 0) & (sm <= .6) & (q != -9999) & ((q.astype('int32') & 1) == 0)
        lat, lon = g['latitude'][:], g['longitude'][:]
    return sm, valid, lat, lon

def corr(a, b):
    return float(np.corrcoef(a, b)[0, 1]) if np.std(a) and np.std(b) else None

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(r'../data/raw'))
    parser.add_argument('--mask', type=Path, help='Nine-date recommended observation count .npy')
    parser.add_argument('--out', type=Path)
    args = parser.parse_args()
    out = args.out or args.root / 'mrms' / 'analysis' / 'eight_intervals'
    out.mkdir(parents=True, exist_ok=True)
    mask_path = args.mask or args.root / 'nisar_coverage' / 'recommended_observation_count.npy'
    counts = np.load(mask_path)
    common = counts == 9
    scenes = []
    for day in DATES:
        path = find_scene(args.root, day)
        sm, valid, lat, lon = read_scene(path)
        if sm.shape != counts.shape:
            raise RuntimeError(f'Grid shape mismatch: {path}')
        if scenes and (not np.array_equal(lat, scenes[0][3]) or not np.array_equal(lon, scenes[0][4])):
            raise RuntimeError(f'Coordinate mismatch: {path}')
        common &= valid
        scenes.append((day, sm, valid, lat, lon))
        print('Read', day, path.name)
    n = int(common.sum())
    if not n:
        raise RuntimeError('No pixels remain in common footprint')
    print(f'Common recommended pixels across all nine dates: {n:,}')
    values = [s[1][common].astype(np.float64) for s in scenes]
    summaries, deciles = [], []
    for i in range(8):
        start, end = values[i], values[i+1]
        delta = end - start
        date0, date1 = DATES[i], DATES[i+1]
        spread0 = float(np.quantile(start, .9) - np.quantile(start, .1))
        spread1 = float(np.quantile(end, .9) - np.quantile(end, .1))
        row = dict(start_date=pd.to_datetime(date0).date().isoformat(),
                   end_date=pd.to_datetime(date1).date().isoformat(),
                   days=int((pd.to_datetime(date1)-pd.to_datetime(date0)).days),
                   pixels=n, initial_mean=float(start.mean()), final_mean=float(end.mean()),
                   mean_change=float(delta.mean()), median_change=float(np.median(delta)),
                   fraction_wetter=float((delta > 0).mean()),
                   initial_p10=float(np.quantile(start,.1)), initial_p90=float(np.quantile(start,.9)),
                   final_p10=float(np.quantile(end,.1)), final_p90=float(np.quantile(end,.9)),
                   initial_p90_p10=spread0, final_p90_p10=spread1,
                   spread_ratio=spread1/spread0 if spread0 else None,
                   initial_final_r=corr(start,end),
                   initial_change_r_coupled=corr(start,delta))
        summaries.append(row)
        # Stable quantile grouping by initial moisture, with deterministic tie-breaking.
        rank = pd.Series(start).rank(method='first')
        bins = pd.qcut(rank, 10, labels=False).to_numpy() + 1
        for d in range(1,11):
            sel = bins == d
            deciles.append(dict(start_date=row['start_date'], end_date=row['end_date'],
                                decile=d, n=int(sel.sum()),
                                initial_median=float(np.median(start[sel])),
                                final_median=float(np.median(end[sel])),
                                change_median=float(np.median(delta[sel])),
                                change_q25=float(np.quantile(delta[sel],.25)),
                                change_q75=float(np.quantile(delta[sel],.75)),
                                fraction_wetter=float((delta[sel] > 0).mean())))
    s = pd.DataFrame(summaries)
    d = pd.DataFrame(deciles)
    s.to_csv(out/'interval_summary.csv', index=False)
    d.to_csv(out/'interval_deciles.csv', index=False)
    labels = [f"{x[5:]}→{y[5:]}" for x,y in zip(DATES[:-1],DATES[1:])]
    fig, axes = plt.subplots(3, 1, figsize=(12, 11), sharex=True)
    x = np.arange(8)
    axes[0].bar(x, s.mean_change)
    axes[0].axhline(0, color='gray', lw=.8)
    axes[0].set_ylabel('Mean change (m³/m³)')
    axes[0].set_title('NISAR common-footprint moisture changes')
    axes[1].plot(x, s.initial_p90_p10, 'o-', label='Start P90−P10')
    axes[1].plot(x, s.final_p90_p10, 'o-', label='End P90−P10')
    axes[1].set_ylabel('Spatial spread (m³/m³)')
    axes[1].legend()
    axes[2].plot(x, s.initial_final_r, 'o-', label='Initial vs final r')
    axes[2].plot(x, s.initial_change_r_coupled, 'o--', label='Initial vs change r (coupled)')
    axes[2].axhline(0, color='gray', lw=.8)
    axes[2].set_ylabel('Pearson r')
    axes[2].legend()
    axes[2].set_xticks(x, labels, rotation=35, ha='right')
    fig.tight_layout()
    fig.savefig(out/'eight_interval_overview.png', dpi=170)
    plt.close(fig)
    fig, axes = plt.subplots(2, 4, figsize=(17, 8), sharey=True)
    for i, ax in enumerate(axes.flat):
        subset = d.iloc[i*10:(i+1)*10]
        ax.plot(subset.decile, subset.change_median, 'o-')
        ax.fill_between(subset.decile.to_numpy(), subset.change_q25.to_numpy(), subset.change_q75.to_numpy(), alpha=.2)
        ax.axhline(0, color='gray', lw=.8)
        ax.set_title(labels[i])
        ax.set_xticks([1,3,5,7,10])
        if i >= 4: ax.set_xlabel('Initial moisture decile (dry → wet)')
        if i % 4 == 0: ax.set_ylabel('Median change (m³/m³)')
    fig.suptitle('Change by initial-moisture decile: median and IQR')
    fig.tight_layout()
    fig.savefig(out/'eight_interval_deciles.png', dpi=170)
    plt.close(fig)
    (out/'summary.json').write_text(json.dumps({'common_pixels':n,'intervals':summaries},indent=2))
    print(s[['start_date','end_date','mean_change','fraction_wetter','spread_ratio','initial_final_r','initial_change_r_coupled']].to_string(index=False))
    print('WARNING: initial-change correlations are mathematically coupled; spatial pixels are not independent samples.')
    print('Saved:', out)

if __name__ == '__main__':
    main()

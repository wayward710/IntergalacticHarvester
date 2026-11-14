"""Inventory and quality-check local NISAR SME2 HDF5 acquisitions.

Usage: python nisar_quality_report.py --folder ../data/raw
Outputs CSVs to the selected folder. No network access required.
"""
import argparse
import csv
import re
from pathlib import Path

import h5py
import numpy as np

BASE = 'science/LSAR/SME2/grids'
PATTERN = re.compile(r'NISAR_L3_PR_SME2_(\d+)_(\d+)_(A|D)_(\d+)_(\d+)_.*?_(\d{8}T\d{6})_(\d{8}T\d{6})_([A-Z]\d+)_')


def fill_value(ds, default=None):
    value = ds.attrs.get('_FillValue', default)
    return float(np.asarray(value).item()) if value is not None else None


def stats_for(path, references):
    row = {'filename': path.name, 'size_mb': round(path.stat().st_size / (1024 ** 2), 2), 'status': 'ok', 'error': ''}
    match = PATTERN.search(path.name)
    if match:
        sequence, track, direction, frame, segment, start, end, processing = match.groups()
        row.update(sequence=sequence, track=track, direction=direction, frame=frame,
                   segment=segment, acquisition_utc=start, processing=processing,
                   group=f'{track}_{direction}_{frame}_{segment}_{processing}')
    else:
        row.update(group='unparsed')

    with h5py.File(path, 'r') as h5:
        g = h5[BASE]
        ds = g['soilMoisture']
        qds = g['retrievalQualityFlag']
        lat = g['latitude'][:]
        lon = g['longitude'][:]
        moisture = ds[:]
        flags = qds[:]
        fill = fill_value(ds)
        qfill = fill_value(qds)
        valid = np.isfinite(moisture)
        if fill is not None:
            valid &= moisture != fill
        plausible = valid & (moisture >= 0) & (moisture <= 0.6)
        qvalid = np.ones(flags.shape, dtype=bool)
        if qfill is not None:
            qvalid &= flags != qfill
        recommended = plausible & qvalid & ((flags & 1) == 0)
        count = int(plausible.sum())
        values = moisture[plausible]
        row.update(shape=f'{ds.shape[0]}x{ds.shape[1]}', latitude_len=len(lat), longitude_len=len(lon),
                   latitude_first=float(lat[0]), latitude_last=float(lat[-1]),
                   longitude_first=float(lon[0]), longitude_last=float(lon[-1]),
                   soil_units=str(ds.attrs.get('units', b'').decode('utf-8', errors='replace') if isinstance(ds.attrs.get('units'), bytes) else ds.attrs.get('units', '')),
                   fill_value=fill, total_pixels=moisture.size, valid_pixels=count,
                   valid_pct=round(100 * count / moisture.size, 3),
                   recommended_pixels=int(recommended.sum()),
                   recommended_pct_of_valid=round(100 * recommended.sum() / count, 3) if count else None,
                   out_of_range_pixels=int((valid & ~plausible).sum()),
                   mean=round(float(values.mean()), 5) if count else None,
                   median=round(float(np.median(values)), 5) if count else None,
                   minimum=round(float(values.min()), 5) if count else None,
                   maximum=round(float(values.max()), 5) if count else None)
        # Grid alignment is checked against the first file in the same orbit/track/frame,
        # independent of processing version. Equal dimensions alone are insufficient.
        grid_key = (row.get('track'), row.get('direction'), row.get('frame'), row.get('segment'))
        if grid_key not in references:
            references[grid_key] = (lat.copy(), lon.copy())
            row['grid_matches_first_in_track'] = 'reference'
        else:
            ref_lat, ref_lon = references[grid_key]
            row['grid_matches_first_in_track'] = str(
                np.array_equal(lat, ref_lat) and np.array_equal(lon, ref_lon)
            )
    return row


def write_csv(path, rows):
    fields = list(dict.fromkeys(key for row in rows for key in row))
    with path.open('w', newline='', encoding='utf-8-sig') as out:
        writer = csv.DictWriter(out, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--folder', type=Path, default=Path(r'../data/raw'))
    args = parser.parse_args()
    paths = sorted(args.folder.glob('*.h5'))
    if not paths:
        parser.error(f'No .h5 files found directly in {args.folder}')
    references, rows = {}, []
    for i, path in enumerate(paths, 1):
        print(f'[{i}/{len(paths)}] {path.name}', flush=True)
        try:
            row = stats_for(path, references)
            print(f"  valid={row['valid_pct']}% recommended={row['recommended_pct_of_valid']}% grid={row['grid_matches_first_in_track']}", flush=True)
        except (OSError, KeyError, ValueError, IndexError) as exc:
            row = {'filename': path.name, 'status': 'error', 'error': str(exc)}
            print(f'  ERROR: {exc}', flush=True)
        rows.append(row)
    output = args.folder / 'nisar_acquisition_quality.csv'
    write_csv(output, rows)
    print(f'\nWrote {output}')
    print('Note: percentages cover whole scenes, not the Mahomet Aquifer ROI.')
    print('Recommended means quality-flag bit 0 is clear; review additional flags before scientific use.')


if __name__ == '__main__':
    main()

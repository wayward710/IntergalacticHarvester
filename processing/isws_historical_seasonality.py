#!/usr/bin/env python3
"""Explore seasonality of rapid groundwater drawdowns in ISWS well JSON files.

pip install pandas numpy matplotlib
python isws_historical_seasonality.py "../data/raw/isws" --output "../data/raw/isws\\historical_seasonality"

Candidate events are NOT confirmed pumping. Values are assumed to be in feet;
verify source units before interpreting the default 0.5-unit threshold.
"""
import argparse
import json
import re
from pathlib import Path

import numpy as np
import pandas as pd
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

PAIRS = [('CHAM-08-02A','CHAM-08-02B'),('CHAM-09-03A','CHAM-09-03C'),
         ('PIAT-09-01A','PIAT-09-01B'),('MTOW-11','MTOW-14'),
         ('CHAM-08-06','CHM-95B'),('CHAM-08-08A','CHAM-08-08B'),
         ('MTH-22A','MTH-22B')]

def well_key(name):
    m = re.match(r'^\s*([A-Za-z]+-\d+(?:-\d+)?[A-Za-z]?)\b', str(name))
    return m.group(1).upper() if m else str(name).strip().upper()

def read_well(path, start_ms, end_ms):
    with path.open(encoding='utf-8-sig') as f:
        obj = json.load(f)
    if not isinstance(obj, dict):
        return None
    p = obj.get('properties') or {}
    name = str(p.get('name') or path.stem)
    well = well_key(name)
    coords = (obj.get('geometry') or {}).get('coordinates') or []
    metadata = dict(well=well, name=name, network=p.get('network'),
                    aquifer=p.get('local_aq_name'), depth=p.get('depth'),
                    latitude=coords[1] if len(coords)>1 else None,
                    longitude=coords[0] if coords else None, file=str(path))
    rows = []
    for series in obj.get('water_levels_highchart') or []:
        if str(series.get('name', '')).casefold() != 'telemetry':
            continue
        for item in series.get('data') or []:
            if not isinstance(item, (list, tuple)) or len(item)<2:
                continue
            try:
                ms, elev = float(item[0]), float(item[1])
                if start_ms <= ms < end_ms and np.isfinite(elev) and -10000 < elev < 10000:
                    rows.append((int(ms), elev))
            except (ValueError, TypeError, OverflowError):
                continue
    if not rows:
        return metadata, pd.Series(dtype=float)
    df = pd.DataFrame(rows, columns=['ms','level']).sort_values('ms')
    # Exclude conflicting duplicate timestamps, rather than choosing one value.
    bad = df.groupby('ms')['level'].nunique()
    df = df[~df['ms'].isin(bad[bad>1].index)].drop_duplicates('ms')
    times = pd.to_datetime(df['ms'].to_numpy(), unit='ms', utc=True)
    s = pd.Series(df['level'].to_numpy(), index=times).sort_index()
    return metadata, s

def analyze(well, s, threshold, recovery_fraction, recovery_hours):
    """Detect local drops within <=6 hours, followed by recovery within window.

    A candidate is a decline of at least threshold from a recent 6-hour high,
    followed by recovery of recovery_fraction of that decline. Do not bridge
    missing hours. Suppress overlapping detections until recovery/timeout.
    """
    if s.empty:
        return [], []
    h = s.resample('1h').median()
    # Only compare a 6h window with all 7 hourly readings present.
    prior_high = h.shift(1).rolling(6, min_periods=6).max()
    drop = prior_high - h
    candidates = drop >= threshold
    events = []
    busy_until = pd.Timestamp('1900-01-01', tz='UTC')
    for t in h.index[candidates.fillna(False)]:
        if t <= busy_until:
            continue
        peak = float(prior_high.loc[t]); low = float(h.loc[t]); amplitude = peak-low
        # Find the low and recovery without crossing missing-hour gaps.
        future = h.loc[t:t+pd.Timedelta(hours=recovery_hours)]
        if len(future)<2:
            continue
        missing = future.isna().to_numpy()
        if missing.any():
            future = future.iloc[:int(np.flatnonzero(missing)[0])]
        if future.empty:
            continue
        target = low + recovery_fraction*amplitude
        recovered = future[future >= target]
        if recovered.empty:
            # A sustained decline may be important, but is not a recovery event.
            busy_until = t + pd.Timedelta(hours=recovery_hours)
            continue
        rt = recovered.index[0]
        events.append(dict(well=well, drop_time_utc=t, recovery_time_utc=rt,
                           drop_magnitude=round(amplitude, 3),
                           recovery_hours=round((rt-t).total_seconds()/3600,1),
                           year=t.year, month=t.month))
        busy_until = rt
    # Complete days with >=18 observations are used as exposure denominator.
    daily = h.resample('1D').count()
    days = [dict(well=well, date=d, year=d.year, month=d.month,
                 valid_day=int(n>=18), n_readings=int(n)) for d,n in daily.items()]
    return events, days

def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('directory', type=Path)
    ap.add_argument('--output', type=Path, default=Path('isws_historical_seasonality'))
    ap.add_argument('--start', default='2015-01-01')
    ap.add_argument('--end', default='2027-01-01', help='Exclusive end date')
    ap.add_argument('--drop-threshold', type=float, default=0.5,
                    help='Minimum drawdown in source elevation units (default 0.5)')
    ap.add_argument('--recovery-fraction', type=float, default=0.75)
    ap.add_argument('--recovery-hours', type=int, default=48)
    args=ap.parse_args()
    args.output.mkdir(parents=True,exist_ok=True)
    start_ms=int(pd.Timestamp(args.start,tz='UTC').timestamp()*1000)
    end_ms=int(pd.Timestamp(args.end,tz='UTC').timestamp()*1000)
    paths=sorted(args.directory.rglob('*.json'))
    meta=[]; all_events=[]; all_days=[]; errors=[]
    for i,path in enumerate(paths,1):
        if args.output.resolve() in path.resolve().parents:
            continue
        try:
            result=read_well(path,start_ms,end_ms)
            if result is None: continue
            m,s=result
            meta.append(m)
            events,days=analyze(m['well'],s,args.drop_threshold,
                                args.recovery_fraction,args.recovery_hours)
            all_events.extend(events); all_days.extend(days)
            print(f'[{i}/{len(paths)}] {m["well"]}: {len(s):,} readings, {len(events)} candidates',flush=True)
        except (OSError,ValueError,TypeError,json.JSONDecodeError) as exc:
            errors.append(dict(file=str(path),error=str(exc)))
    pd.DataFrame(meta).to_csv(args.output/'well_metadata.csv',index=False)
    pd.DataFrame(errors,columns=['file','error']).to_csv(args.output/'errors.csv',index=False)
    event_cols=['well','drop_time_utc','recovery_time_utc','drop_magnitude','recovery_hours','year','month']
    events=pd.DataFrame(all_events,columns=event_cols)
    events.to_csv(args.output/'candidate_events.csv',index=False)
    days=pd.DataFrame(all_days,columns=['well','date','year','month','valid_day','n_readings'])
    if days.empty:
        print('No telemetry observations in requested date range.');return
    coverage=days.groupby(['well','year','month'],as_index=False).agg(
        valid_days=('valid_day','sum'),observed_hours=('n_readings','sum'))
    counts=events.groupby(['well','year','month']).size().rename('candidate_events').reset_index() if not events.empty else pd.DataFrame(columns=['well','year','month','candidate_events'])
    monthly=coverage.merge(counts,on=['well','year','month'],how='left')
    monthly['candidate_events']=monthly['candidate_events'].fillna(0).astype(int)
    monthly['events_per_30_valid_days']=np.where(monthly.valid_days>0,
        monthly.candidate_events*30/monthly.valid_days,np.nan)
    monthly.to_csv(args.output/'monthly_event_rates.csv',index=False)
    yearly=monthly.groupby(['well','year'],as_index=False).agg(
        valid_days=('valid_days','sum'),candidate_events=('candidate_events','sum'))
    yearly.to_csv(args.output/'yearly_coverage.csv',index=False)
    monthly['season']=np.select([monthly.month.isin([6,7,8]),monthly.month.isin([12,1,2])],
                               ['summer','winter'],default='other')
    season=monthly[monthly.season!='other'].groupby(['well','season'],as_index=False).agg(
        valid_days=('valid_days','sum'),candidate_events=('candidate_events','sum'))
    season['events_per_30_valid_days']=np.where(season.valid_days>0,
        season.candidate_events*30/season.valid_days,np.nan)
    season.to_csv(args.output/'summer_winter_comparison.csv',index=False)
    focus=set(sum(([a,b] for a,b in PAIRS),[]))
    for well in sorted(focus):
        subset=monthly[monthly.well==well].copy()
        if subset.empty:continue
        # Monthly aggregation across years, with exposure denominator.
        agg=subset.groupby('month',as_index=False).agg(valid_days=('valid_days','sum'),
                                                        events=('candidate_events','sum'))
        agg['rate']=np.where(agg.valid_days>=10,30*agg.events/agg.valid_days,np.nan)
        fig,ax=plt.subplots(figsize=(9,4))
        ax.bar(agg.month,agg.rate)
        ax.set(xticks=range(1,13),xlabel='Month',ylabel='Candidate events / 30 valid days',
               title=f'{well}: historical drawdown-and-recovery candidates')
        ax.grid(axis='y',alpha=.25)
        fig.tight_layout();fig.savefig(args.output/f'{well}_seasonality.png',dpi=130);plt.close(fig)
    print(f'\nSaved outputs to {args.output}')
    print('IMPORTANT: Event counts are heuristic, not verified pumping; inspect events and coverage.')

if __name__=='__main__':main()

# Methodology — Mahomet Moisture Observatory

## 1. Fixed / Common-Footprint Soil Moisture Comparison
Satellite SAR swaths vary slightly in valid pixel coverage across orbital passes due to retrieval quality flags, water masks, or swath edge geometry. Computing naive scene-wide averages on each acquisition date can introduce artificial shifts caused purely by changing spatial coverage.

To ensure strict spatial comparability across all **nine 2026 NISAR L3 SME2 acquisitions** (`2026-07-02`, `2026-07-14`, `2026-07-26`, `2026-08-19`, `2026-08-31`, `2026-09-12`, `2026-09-24`, `2026-10-06`, `2026-10-18`), all summary statistics and interval differences are evaluated over the exact intersection of valid pixels present in every acquisition (**137,553 common pixels** in EASE-Grid 2.0 `EPSG:6933`).

## 2. Exact Acquisition-Time Precipitation Alignment (NOAA MRMS)
Rather than aggregating rainfall between UTC midnight boundaries, hourly NOAA MRMS precipitation grids over the Mahomet Aquifer (**11,064 grid cells**) are aligned directly to the exact NISAR overpass timestamps (`~00:50:39` to `00:50:42 UTC`). For each acquisition $t_i$, antecedent rainfall windows are computed over:
- **Prior 3 days** ($t_i - 72	ext{ h}$ to $t_i$)
- **Prior 7 days** ($t_i - 168	ext{ h}$ to $t_i$)
- **Prior 12 days** ($t_i - 288	ext{ h}$ to $t_i$)
- **Full inter-acquisition interval** ($t_{i-1}$ to $t_i$; 12 days for seven intervals, 24 days for July 26 – August 19)

## 3. Spatial Aggregation & Initial-Moisture Stratification
- **MRMS Cell Aggregation:** NISAR pixels are spatially joined to the coarser MRMS grid cells (`6,710` matched cells containing `137,532` of the `137,553` common pixels) to compare local rainfall totals against cell-averaged soil moisture changes.
- **Decile Stratification:** Both common pixels (`n = 13,755–13,756` per decile) and matched MRMS cells (`n = 671` per decile) are partitioned into 10 equal-count deciles ranked by initial soil moisture at the start of each interval.

## 4. ISWS Groundwater Monitoring & Seasonal Event Detection
- **2026 Telemetry:** Hourly water-level elevations from **47 active telemetered wells** (out of 102 cataloged wells in the Mahomet/Glasford/Henry system) are aggregated into daily means, medians, and ranges across the 109-day study window (`2026-07-02` to `2026-10-18`).
- **Paired Well Comparison:** Seven co-located or adjacent well pairs compare deep confined Mahomet completions against shallower Glasford or Henry aquifer completions.
- **Historical Event Seasonality (2015–2026):** Automated threshold detection across 64 wells identifies rapid drawdown-and-recovery cycles (`1,424` candidate events with drawdown $\ge 0.50	ext{ ft}$ and recovery within $\le 48	ext{ hours}$), normalized by valid observation days (`events_per_30_valid_days`).

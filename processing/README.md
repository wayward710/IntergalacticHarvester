# Processing & Reference Scripts

Place the six reference Python data-preparation scripts (`nisar_eight_interval_analysis.py`, `nisar_fixed_footprint.py`, `nisar_quality_report.py`, `mrms_mahomet_aggregate.py`, `nisar_mrms_spatial_compare.py`, `nisar_initial_moisture_analysis.py`, and `isws_historical_seasonality.py`) in this directory after stripping local Windows paths.

## Validation data for the web app

`build_validation_data.py` regenerates `interval_summary.json`, `wells_response.json` and `bondville_check.json` in `app/public/data/` from files already in the repo (rasters, manifests, groundwater series, `well_seasonality.json`, and the NOAA USCRN daily file in `data/probe/`). It is deterministic and prints the test values it reproduces.

```bash
pip install numpy pandas tifffile imagecodecs
python processing/build_validation_data.py
```

`app/public/data/well_seasonality.json` is delivered ready-made from the full ISWS histories (not in the repo).

# Data Sources & Provenance

1. **NASA NISAR L3 Soil Moisture (SME2):**
   - **Variable:** Volumetric near-surface soil moisture ($	ext{m}^3/	ext{m}^3$), top ~0–5 cm sensing depth.
   - **Acquisitions:** 9 passes between July 2, 2026 and October 18, 2026 (~00:50:40 UTC).
   - **Native Grid:** EASE-Grid 2.0 (`EPSG:6933`), reprojected to Web Mercator (`EPSG:3857`) / WGS84 (`EPSG:4326`) for web display and spatial joins.

2. **NOAA Multi-Radar Multi-Sensor (MRMS) Precipitation:**
   - **Temporal Coverage:** Hourly Parquet archives from June 20, 2026 through October 19, 2026 (`1,838` hourly files across `2,928` total hours; `11,064` grid cells intersecting the Mahomet Aquifer).
   - **Units & Cross-Check:** Interpreted empirically as **inches**, supported by cross-checking against the Illinois Climate Network (ICN) rain gauge near Champaign, IL during the August 15, 2026 storm (~1.477 in MRMS cell vs. 1.380 in gauge).

3. **Illinois State Water Survey (ISWS) Groundwater Monitoring Network:**
   - **Scope:** 102 cataloged observation wells across 8 regional networks (`MCTAZ`, `ILLINOIS AMERICAN CHAMPAIGN`, `MAHOMET CENTRAL-DECATUR`, `IMPERIAL VALLEY`, etc.), spanning the **Mahomet** (`82` wells), **Glasford** (`19` wells), and **Henry** (`1` well) aquifers.
   - **2026 Active Telemetry:** `47` continuously telemetered wells (`118,756` hourly readings; `4,964` well-days from July 2 to October 18, 2026).

4. **USDA NASS 2025 Cropland Data Layer (CDL):**
   - **Scope:** 30-meter agricultural land-cover classification used as a baseline reference for row-crop distribution (corn and soybeans) across the Mahomet Aquifer.

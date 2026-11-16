# AQUA-SAR

An interactive map exploring **surface soil moisture over the Mahomet Aquifer region of central Illinois**, alongside precipitation and groundwater monitoring locations. Built for the **NASA Space Apps Challenge 2026**.

The map combines:

- **NASA NISAR L3 SME2** satellite soil-moisture observations from nine dates (July 2–October 18, 2026).
- **Changes in surface soil moisture** between consecutive satellite acquisitions.
- **NOAA MRMS** accumulated precipitation between acquisitions (inches).
- The **Mahomet Aquifer boundary**, Illinois county/city reference features, and **30 candidate Illinois State Water Survey (ISWS) groundwater wells**.

## Key Features

- **Satellite soil-moisture mapping:** Explore NISAR surface soil-moisture observations across nine acquisition dates.
- **Temporal change detection:** Compare consecutive acquisitions to identify areas becoming wetter or drier.
- **Precipitation analysis:** Visualize accumulated MRMS rainfall between satellite acquisition dates.
- **Groundwater geographic exploration:** Explore 30 ISWS candidate well locations and their satellite coverage.
- **Interactive geographic exploration:** Navigate the Mahomet Aquifer region with county, city, and reference layers. 

Use the date slider or Previous/Next buttons to move between satellite acquisitions. Choose **Soil moisture**, **Change from previous date**, or **Accumulated precipitation** from the Display menu. The first date has no preceding interval, so change and precipitation views start with the second acquisition. Checkboxes show or hide map reference layers. Click a well marker to inspect its metadata and satellite-coverage information.

**Important:** NISAR measures near-surface soil moisture (top 5 cm), *not* groundwater level. The well markers currently show monitoring locations and satellite coverage metadata, not synchronized groundwater-level readings. Trends between surface moisture, precipitation, and groundwater cannot automatically be interpreted as cause-and-effect relationships.

## Run it on your own Windows laptop

You do **not** need Python, GIS software, or a NASA account just to view the prepared map. You do need the **complete project folder, including its data files**. Source code alone will not display the satellite imagery.

### 1. Install Node.js

1. Visit <https://nodejs.org/>.
2. Install a supported **LTS** version of Node.js (which includes `npm`).
3. After installation, open **PowerShell** (Windows Start menu → type `PowerShell`).
4. Check that the installation worked:

   ```powershell
   node --version
   npm --version
   ```

   Both commands should print a version number. If Windows cannot find `node`, close and reopen PowerShell and try again.

### 2. Get the complete project folder

Download the project as a ZIP from its GitHub repository (**Code → Download ZIP**) and extract it somewhere convenient, such as `Documents\mahomet-map-starter`. The repository is intended to include the complete prepared dataset, so no separate Google Drive download or data-processing step should be necessary. 

The folder should contain `package.json`, `src/`, and `public/data/`. In particular, `public/data/` must contain:

- `acquisitions.json` and `precipitation_manifest.json`
- Nine `nisar_sm_YYYYMMDD.tif` files
- Eight `nisar_sm_change_YYYYMMDD_YYYYMMDD.tif` files
- Eight `mrms_precip_YYYYMMDD_YYYYMMDD.tif` files
- `mahomet_aquifer.geojson`, `isws_candidate_wells.geojson`, `illinois_context_cities.geojson`, and `illinois_context_counties.geojson`

**Check before proceeding:** there should be 25 `.tif` files in `public/data/`. If any are missing, ask the maintainer for a complete repository ZIP rather than attempting to generate them yourself.

### 3. Open PowerShell in the project folder

In File Explorer, open the extracted folder, click its address bar, type `powershell`, and press Enter. A PowerShell window should open in that folder.

Confirm you are in the right place:

```powershell
Test-Path .\package.json
```

It should say `True`.

### 4. Install and start

Run these commands one at a time:

```powershell
npm install
npm run dev
```

Wait for a message containing a local URL, usually **http://localhost:5173/**. Open that address in your browser. Leave PowerShell running while you use the map.

To stop the app, return to PowerShell and press **Ctrl+C**. Next time, reopen PowerShell in the same project folder and run only `npm run dev`—you normally don't need `npm install` again.

### What if it doesn't work?

| Problem | What to try |
| --- | --- |
| `node` or `npm` is not recognized | Install Node.js LTS, then reopen PowerShell. |
| `package.json` cannot be found | Open PowerShell in the folder containing `package.json`, not its parent folder. |
| Browser says the site cannot be reached | Keep `npm run dev` running; use the exact local URL printed in PowerShell. |
| The page opens, but imagery is blank | Check that `public/data/` contains the `.tif` files and both manifest `.json` files. Look for errors in the browser console (F12). |
| Counties or well markers are missing | Check for the four `.geojson` files listed above. |
| `npm install` fails | Copy the full error message and send it to the project maintainer. |

## For developers and data maintainers

- Frontend: React, TypeScript, Vite, ArcGIS Maps SDK for JavaScript.
- `src/App.tsx`: map layers, display modes, controls, popups, and rendering.
- `src/layers.ts`: manifest types, validation, and date formatting.
- `public/data/acquisitions.json`: nine soil-moisture acquisitions and eight change intervals.
- `public/data/precipitation_manifest.json`: eight MRMS precipitation intervals and associated coverage metadata.
- `public/data/*.tif`: locally served Cloud Optimized GeoTIFFs (COGs). NISAR rasters use EPSG:6933; precipitation rasters use EPSG:4326.
- `public/data/*.geojson`: aquifer, wells, and geographic context.

This application uses prepared data. Rebuilding the GeoTIFFs from source NISAR/MRMS products is a **separate analysis workflow**, not a prerequisite for viewing the map.

### Data interpretation and limitations

- Soil moisture and soil-moisture change are expressed in **m³/m³**; positive change means wetter surface conditions.
- MRMS precipitation totals are in **inches** for intervals between acquisition dates. The interval processing uses UTC-midnight boundaries. Consult the precipitation manifest's available/missing-hour metadata before interpreting totals as complete observational coverage.
- Satellite acquisitions have spatial gaps and quality masks; absence of a colored pixel does not mean zero moisture.
- The 30 wells were selected for monitoring-data availability and valid NISAR pixel coverage; the green/orange categories indicate **nine of nine** versus **partial** valid acquisition coverage, not groundwater conditions.
- The interface is an exploratory visualization, not a groundwater prediction or aquifer recharge model.
- The 25 prepared GeoTIFFs total approximately **79.15 MB** and are intended to be tracked in this repository. Avoid committing the much larger raw source products or repeatedly replacing generated rasters without a reason. Ensure `.gitignore` does **not** exclude `public/data/*.tif`.

## Acknowledgments

NASA NISAR; NOAA Multi-Radar/Multi-Sensor System (MRMS); Illinois State Water Survey (ISWS); US Census Bureau geographic reference data. Check individual data-source attribution and license requirements before public release.

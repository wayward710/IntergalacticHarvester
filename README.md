# AQUA-SAR — Mahomet Aquifer & Soil Moisture Observatory
**NASA Space Apps Challenge 2026 | Team Intergalactic Harvester**

🌐 **Live Interactive Observatory:** [https://intergalacticharvester.pages.dev/](https://intergalacticharvester.pages.dev/)

An interactive geospatial decision-support observatory and reproducible scientific workflow investigating near-surface soil moisture dynamics, precipitation forcing, and groundwater monitoring patterns across the **Mahomet Aquifer** region of central Illinois (July – October 2026).

By fusing **NASA NISAR** (L-band ~24 cm SAR soil moisture), **NOAA MRMS** (daily precipitation), **ISWS** (groundwater well telemetry), and **USDA CDL** (crop layers), **AQUA-SAR** bridges the gap between raw satellite radar pixels and actionable decisions for agriculture, water management, and parametric climate risk.

---

## Key Scientific Highlights (2026 Study Window)

* **Common-Footprint Soil Moisture (`137,553` shared NISAR L3 SME2 pixels):** Mean near-surface volumetric soil moisture ranged from a dry minimum of **0.1647 m³/m³** (October 18, 2026) to a wet peak of **0.2424 m³/m³** (August 19, 2026).
* **Major Late-Summer Wetting Surge (July 26 – August 19, 2026):** Mean soil moisture increased by **+0.0682 m³/m³ (+39.2% relative gain)**, with **99.29%** of common pixels becoming wetter following **8.16 in** of interval rainfall (peaking at **2.52 in** on August 15, 2026).
* **Precipitation Coupling:** Across the eight consecutive NISAR intervals (~12-day revisit cycle), soil moisture change ($\Delta \text{SM}$) correlates strongly with total interval precipitation ($r = 0.8135$) and prior 7-day cumulative rainfall ($r = 0.8167$).
* **Antecedent Wetness Stratification:** Drier soils at the start of an interval consistently exhibit larger subsequent moisture gains during wetting events (e.g., **+0.0880 m³/m³** mean gain in the driest initial decile vs. **+0.0373 m³/m³** in the wettest decile during July 26 – August 19).
* **ISWS Groundwater & Hydrological Decoupling:** Analysis across **47 regional ISWS monitoring wells** (with the active overlapping stations mapped interactively in the web app) and a 12-year historical record (2015–2026; **1,424** rapid drawdown/recovery events) highlights strong summer seasonality (**62.2%** of events occur in June–September) and contrasting hydraulic responses between deep confined Mahomet wells and shallower Glasford/Henry wells.
* **Local Agricultural Hydrology Context:** Incorporates central Illinois **tile drainage** and **retention pond** dynamics to explain rapid lateral surface runoff (surface-to-aquifer decoupling) and to flag both **flash surface drought** and **excess waterlogging** (preventing heavy farm machinery from getting stuck in wet fields).

---

## Real-World Impact & Scalability

* **Parametric Crop Insurance:** Provides objective, high-resolution L-band radar verification for both early drought stress and excess-moisture / prevented-planting claims.
* **Agri-Supply Chain Early Warning:** Enables grain processors and logistics operators to anticipate planting or harvest delays across corn and soybean belts.
* **Watershed & Nutrient Management:** Helps regional water authorities track surface saturation spikes linked to tile-drainage runoff.

---

## Repository Structure

```text
IntergalacticHarvester/
├── app/                     # Interactive web mapping application
├── notebooks/               # Reproducible Google Colab / Jupyter scientific notebook
│   └── mahomet_water_analysis.ipynb
├── data/
│   ├── boundaries/          # Study-area boundary GeoJSON (mahomet_aquifer.geojson)
│   ├── summaries/           # Lightweight aggregated CSV & JSON tables for notebook & app
│   └── wells/               # ISWS groundwater well metadata, 2026 daily series & historical events
├── processing/              # Reference Python extraction & spatial alignment scripts
├── assets/                  # Publication figures and precomputed map overlays
│   └── figures/
└── docs/                    # Methodology, data provenance, and scientific limitations
    ├── methodology.md
    ├── data-sources.md
    └── limitations.md
```

---

## Quickstart

### 1. Interactive Web Observatory
* **Live Deployment:** Open [https://intergalacticharvester.pages.dev/](https://intergalacticharvester.pages.dev/) directly in any modern browser.
* **Local Development:**
  ```bash
  git clone [https://github.com/wayward710/IntergalacticHarvester.git](https://github.com/wayward710/IntergalacticHarvester.git)
  cd IntergalacticHarvester/app
  npm install
  npm run dev
  ```

### 2. Reproducible Scientific Notebook
* **Google Colab (Zero Setup):** Upload `notebooks/mahomet_water_analysis.ipynb` to Google Colab (or open directly from GitHub) and run all cells from top to bottom. The configuration cell automatically detects local `data/` directories when cloned locally, or fetches the lightweight CSV/JSON summaries directly from the repository when opened standalone in Colab.
* **Local Jupyter Environment:**
  ```bash
  git clone [https://github.com/wayward710/IntergalacticHarvester.git](https://github.com/wayward710/IntergalacticHarvester.git)
  cd IntergalacticHarvester/notebooks
  pip install pandas numpy matplotlib seaborn scipy jupyter
  jupyter notebook mahomet_water_analysis.ipynb
  ```

---

## AI Tools Disclosure & Acknowledgments
In accordance with NASA Space Apps Challenge guidelines, our team discloses the use of **Claude** and **Lovable** to assist with frontend UI code generation, styling polish, and rapid web deployment. All scientific data ingestion, statistical modeling, geospatial harmonization, and hydrological interpretations were designed, executed, and verified by **Team Intergalactic Harvester**.

# Dancing with the SARs — Mahomet Moisture Observatory

**NASA Space Apps Challenge 2026 | Team Intergalactic Harvester**

An interactive web observatory and reproducible scientific notebook investigating near-surface soil moisture dynamics, precipitation forcing, and groundwater monitoring patterns across the **Mahomet Aquifer region of central Illinois** (July – October 2026).

---

## Repository Structure

```text
IntergalacticHarvester/
├── app/                     # React / NodeJS interactive web mapping application
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

## Quickstart: Running the Scientific Notebook

1. **Google Colab (Zero Setup):**
   - Upload `notebooks/mahomet_water_analysis.ipynb` to [Google Colab](https://colab.research.google.com/) (or open directly from GitHub).
   - Run all cells from top to bottom. The configuration cell automatically detects local `data/` directories when cloned locally, or fetches the lightweight CSV/JSON summaries directly from the repository when opened standalone in Colab.
2. **Local Jupyter Environment:**
   ```bash
   git clone https://github.com/wayward710/IntergalacticHarvester.git
   cd IntergalacticHarvester/notebooks
   pip install pandas numpy matplotlib seaborn scipy jupyter
   jupyter notebook mahomet_water_analysis.ipynb
   ```

---

## Key Scientific Highlights (2026 Study Window)

- **Common-Footprint Soil Moisture (`137,553` shared NISAR L3 SME2 pixels):** Mean near-surface volumetric soil moisture ranged from a dry minimum of **0.1647 m³/m³** (October 18, 2026) to a wet peak of **0.2424 m³/m³** (August 19, 2026).
- **Major Late-Summer Wetting Surge (`July 26 – August 19, 2026`):** Mean soil moisture increased by **+0.0682 m³/m³** (+39.2% relative gain), with **99.29%** of common pixels becoming wetter following **8.16 in** of interval rainfall (peaking at **2.52 in** on August 15, 2026).
- **Precipitation Coupling:** Across the eight consecutive NISAR intervals, soil moisture change ($\Delta	ext{SM}$) correlates with total interval precipitation ($r = 0.8135$; $r = -0.17$ without the Jul 26 – Aug 19 storm interval) and prior 7-day cumulative rainfall ($r = 0.8167$; $r = -0.54$ without the storm). The correlation is driven by that one storm.
- **Antecedent Wetness Stratification:** Drier soils at the start of an interval consistently exhibit larger subsequent moisture gains during wetting events (e.g., **+0.0880 m³/m³** mean gain in the driest initial decile vs. **+0.0373 m³/m³** in the wettest decile during July 26 – August 19).
- **ISWS Groundwater Context:** Continuous telemetry across **47 active monitoring wells** (July 2 – October 18, 2026) and a 12-year historical record (2015–2026; **1,424** rapid drawdown/recovery events) highlight strong summer seasonality (**62.2%** of events occur in June–September) and contrasting hydraulic responses between deep confined Mahomet wells and shallower Glasford/Henry wells.

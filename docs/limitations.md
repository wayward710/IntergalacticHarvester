# Scientific Caveats & Limitations

1. **Near-Surface Soil Moisture vs. Deep Groundwater:**
   NISAR L3 SME2 estimates volumetric moisture in the **top few centimeters of soil**, whereas the Mahomet Aquifer is predominantly a deep, confined glacial sand-and-gravel aquifer (depths typically 150–350 ft below land surface). Surface wetting does not equate to immediate deep aquifer recharge.

2. **Discrete Orbital Snapshots:**
   The nine 2026 NISAR acquisitions are instantaneous snapshots spaced 12 days apart (24 days between July 26 and August 19). Short-lived surface wetting and drying cycles occurring between passes are not directly observed by SAR.

3. **Sparse MRMS Parquet Collection & Missing-Hour Assumption:**
   The archived MRMS Parquet collection omits files during dry periods when zero precipitation was recorded across Illinois. Absent hourly files are treated as `0.0 in` in cumulative totals, which cannot be separated from occasional telemetry/archive gaps without external gauge verification.

4. **Empirical Rainfall Unit Verification:**
   MRMS Parquet values are treated as inches based on empirical comparison with the Champaign ICN station on August 15, 2026 (~1.477 in vs. 1.380 in). Users should verify unit metadata before combining these summaries with external precipitation products.

5. **Mathematical Coupling in Initial-vs.-Change Correlations:**
   Because interval change is defined as $\Delta	ext{SM} = 	ext{SM}_{	ext{final}} - 	ext{SM}_{	ext{initial}}$, correlating $\Delta	ext{SM}$ directly against $	ext{SM}_{	ext{initial}}$ introduces structural negative coupling (regression to the mean and shared retrieval noise). Decile medians and initial-vs.-final correlations (`initial_final_r`) should be examined alongside change statistics.

6. **2025 Crop Labels vs. 2026 Satellite Observations:**
   The USDA Cropland Data Layer (CDL) used for agricultural context reflects **2025** planting patterns; because Midwest farms frequently rotate corn and soybeans annually, 2025 labels do not confirm the exact crop planted on a given field in 2026.

7. **Observational Nature of ISWS Well Drawdowns:**
   Rapid drawdown-and-recovery cycles in ISWS hydrographs are observational signatures consistent with nearby pumping or barometric/hydraulic responses; the telemetry dataset alone does not identify specific well operators or prove agricultural irrigation as the sole driver.

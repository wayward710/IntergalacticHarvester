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
   Rapid drawdown-and-recovery cycles in ISWS hydrographs are observational patterns consistent with nearby human water use or barometric/hydraulic responses; there is no withdrawal data for these wells, so the telemetry alone cannot attribute any change to a cause.

8. **One footprint per mean:**
   Every interval mean averages only pixels with a valid retrieval on both dates, and the share of the area covered (about 23–28%) is shown beside it. The choice of footprint changes the answer: the Jul 26 – Aug 19 storm-interval mean change is about +0.050 m³/m³ over pixels valid on both dates (the web app), +0.068 m³/m³ over the 137,553-pixel fixed footprint, and has been reported as low as +0.042 with other pixel sets.

9. **Rain totals are approximate:**
   MRMS interval totals count missing hours as zero, so totals are a lower bound when hours are missing (the app shows hours available of expected beside each total). In the wettest intervals MRMS reads roughly 15–20% below gridMET.

10. **The ground probe and NISAR measure different things:**
    The USCRN probe at Bondville (Champaign 9 SW) is a single point at 5 and 10 cm; NISAR is a 200 m pixel of the top few centimetres. The pixel containing the probe has a retrieval on only 4 of the app's 9 dates, too few to say which is closer to the truth.

11. **Well levels have seasonal and unmeasured human influences:**
    Levels follow a strong seasonal cycle (confined wells highest in spring, lowest in late summer) and are also affected by human water use we have no data for. The app shows patterns, not causes; one regional storm affects all wells at once, so wells are not independent tests.

12. **No predictive model is shown:**
    A rain-and-evapotranspiration model tracks soil moisture well at the ground probe and during the large storm, but not ordinary NISAR changes (about 5% skill without the storm), so it is not shown in the app.

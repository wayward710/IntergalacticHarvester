import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ArcGISMap from "@arcgis/core/Map.js";
import MapView from "@arcgis/core/views/MapView.js";
import ImageryTileLayer from "@arcgis/core/layers/ImageryTileLayer.js";
import GeoJSONLayer from "@arcgis/core/layers/GeoJSONLayer.js";
import RasterStretchRenderer from "@arcgis/core/renderers/RasterStretchRenderer.js";
import Color from "@arcgis/core/Color.js";
import AlgorithmicColorRamp from "@arcgis/core/rest/support/AlgorithmicColorRamp.js";
import MultipartColorRamp from "@arcgis/core/rest/support/MultipartColorRamp.js";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer.js";
import Graphic from "@arcgis/core/Graphic.js";
import Point from "@arcgis/core/geometry/Point.js";
import * as reactiveUtils from "@arcgis/core/core/reactiveUtils.js";
import * as rasterFunctionUtils from "@arcgis/core/layers/support/rasterFunctionUtils.js";
import type ClassBreaksRenderer from "@arcgis/core/renderers/ClassBreaksRenderer.js";
import {
  type AcquisitionManifest, type PrecipitationManifest, type DisplayMode, formatDate, validateManifest, validatePrecipitationManifest,
} from "./layers";
import { type ValidationData, intervalKey, stormCounts, tourWell, useValidationData } from "./validationData";
import { responseRenderer, wellResponseContent } from "./wellsResponse";
import { copy, fmtChange, fmtPct, fmtRain } from "./copy";
import IntervalCard from "./components/IntervalCard";
import WellsLegend from "./components/WellsLegend";
import SeasonalPanel from "./components/SeasonalPanel";
import BondvillePanel from "./components/BondvillePanel";
import LimitsPanel from "./components/LimitsPanel";
import Tour, { type TourStep } from "./components/Tour";

type Panel = "seasonal" | "bondville" | "limits";
type WellColorBy = "response" | "coverage";
const PANELS: { id: Panel; label: string }[] = [
  { id: "seasonal", label: "Wells by season" },
  { id: "bondville", label: "Ground check" },
  { id: "limits", label: "Limits" },
];
const MODES: DisplayMode[] = ["moisture", "change", "precipitation"];
const NO_DATA_GRAY = [128, 128, 128, 255]; // overlay colour for "no retrieval" pixels
const TOUR_ZOOM_WELL = 11;      // map zoom when the tour opens a well
const TOUR_ZOOM_BONDVILLE = 11; // map zoom when the tour shows the probe

// A diverging ramp makes unchanged soil moisture visually neutral.
// CSS legends below use the same anchor colors; intermediate interpolation may differ slightly.
const rampStops: Record<DisplayMode, string[]> = {
  moisture: ["#fff7bc", "#a1dab4", "#225ea8"],
  change: ["#b2182b", "#f7f7f7", "#2166ac"],
  precipitation: ["#ffffe0", "#7db7cc", "#08306b"],
};

function ramp(mode: DisplayMode) {
  const stops = rampStops[mode];
  return new MultipartColorRamp({
    colorRamps: [0, 1].map((i) => new AlgorithmicColorRamp({
      fromColor: new Color(stops[i]),
      toColor: new Color(stops[i + 1]),
      algorithm: "cie-lab",
    })),
  });
}

function legendGradient(mode: DisplayMode) {
  const [a, b, c] = rampStops[mode];
  return `linear-gradient(to right, ${a} 0%, ${b} 50%, ${c} 100%)`;
}


// Groundwater values are interpreted as elevations by the source export, but
// the measurement units and vertical datum have not yet been verified.
type GroundwaterSeries = { source: string; points: [number, number][] };
type GroundwaterWell = { aquifer?: string; aquifer_type?: string; series: GroundwaterSeries[] };
type GroundwaterDataset = { wells: Record<string, GroundwaterWell> };

function groundwaterChart(well: GroundwaterWell, dates: string[], selectedDate?: string): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "groundwater-chart";
  const telemetry = well.series.find((s) => s.source === "Telemetry") ?? well.series[0];
  if (!telemetry?.points.length) {
    wrapper.textContent = "No groundwater observations available for this well.";
    return wrapper;
  }
  // Average only actual observations; missing days remain gaps, not zeroes.
  const days = new Map<number, { sum: number; count: number }>();
  for (const [timestamp, value] of telemetry.points) {
    if (!Number.isFinite(timestamp) || !Number.isFinite(value)) continue;
    const day = Math.floor(timestamp / 86400000) * 86400000;
    const existing = days.get(day) ?? { sum: 0, count: 0 };
    existing.sum += value;
    existing.count += 1;
    days.set(day, existing);
  }
  const points = [...days.entries()].sort((a, b) => a[0] - b[0])
    .map(([time, value]) => ({ time, value: value.sum / value.count, count: value.count }));
  if (!points.length) return wrapper;
  const minTime = Date.parse("2026-07-02T00:00:00Z");
  const maxTime = Date.parse("2026-10-19T00:00:00Z");
  const vals = points.map((p) => p.value);
  const low = Math.min(...vals);
  const high = Math.max(...vals);
  const pad = Math.max((high - low) * 0.12, 0.05);
  const minY = low - pad;
  const maxY = high + pad;
  const W = 340, H = 205, left = 43, right = 9, top = 19, bottom = 27;
  const x = (t: number) => left + (t - minTime) / (maxTime - minTime) * (W - left - right);
  const y = (v: number) => top + (maxY - v) / (maxY - minY) * (H - top - bottom);
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Daily mean groundwater measurements, July to October 2026; vertical lines mark NISAR dates");
  svg.style.width = "100%";
  svg.style.display = "block";
  const element = (tag: string, attrs: Record<string, string>, text?: string) => {
    const el = document.createElementNS(ns, tag);
    for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
    if (text !== undefined) el.textContent = text;
    svg.appendChild(el);
    return el;
  };
  for (let i = 0; i <= 2; i++) {
    const value = minY + (maxY - minY) * i / 2;
    const yy = y(value);
    element("line", { x1: String(left), x2: String(W-right), y1: String(yy), y2: String(yy), stroke: "#d6dce4", "stroke-width": "0.8" });
    element("text", { x: String(left-5), y: String(yy+3), "text-anchor": "end", fill: "#475569", "font-size": "9" }, value.toFixed(1));
  }
  const acquisitionDates = dates.length ? dates : ["2026-07-02", "2026-07-14", "2026-07-26", "2026-08-19", "2026-08-31", "2026-09-12", "2026-09-24", "2026-10-06", "2026-10-18"];
  for (const date of acquisitionDates) {
    const xx = x(Date.parse(`${date}T00:00:00Z`));
    if (!Number.isFinite(xx)) continue;
    element("line", { x1: String(xx), x2: String(xx), y1: String(top), y2: String(H-bottom), stroke: "#7c3aed", "stroke-width": "1.6", "stroke-dasharray": "4 3", "stroke-opacity": "0.9" });
    element("circle", { cx: String(xx), cy: String(top - 6), r: "2.5", fill: "#7c3aed" });
  }
  // Do not connect days with missing observations.
  let path = "", prev: number | null = null;
  for (const point of points) {
    path += `${prev !== null && point.time - prev <= 86400000 ? "L" : "M"}${x(point.time).toFixed(2)},${y(point.value).toFixed(2)} `;
    prev = point.time;
  }
  element("path", { d: path.trim(), fill: "none", stroke: "#0f766e", "stroke-width": "1.8", "stroke-linejoin": "round" });
  // Draw acquisition markers above the groundwater curve so they cannot be obscured.
  for (const date of acquisitionDates) {
    const xx = x(Date.parse(`${date}T00:00:00Z`));
    if (Number.isFinite(xx)) element("circle", { cx: String(xx), cy: String(top + 3), r: "3", fill: "#7c3aed", stroke: "white", "stroke-width": "0.8" });
  }
  const selectedLine = element("line", { x1: "0", x2: "0", y1: String(top), y2: String(H-bottom), stroke: "#ea580c", "stroke-width": "2.5", "data-groundwater-selected": "true" });
  const selectedDot = element("circle", { cx: "0", cy: String(top - 6), r: "4", fill: "#ea580c", stroke: "white", "stroke-width": "1", "data-groundwater-selected-dot": "true" });
  const selectedX = selectedDate ? x(Date.parse(`${selectedDate}T00:00:00Z`)) : NaN;
  selectedLine.setAttribute("visibility", Number.isFinite(selectedX) ? "visible" : "hidden");
  selectedDot.setAttribute("visibility", Number.isFinite(selectedX) ? "visible" : "hidden");
  if (Number.isFinite(selectedX)) {
    selectedLine.setAttribute("x1", String(selectedX));
    selectedLine.setAttribute("x2", String(selectedX));
    selectedDot.setAttribute("cx", String(selectedX));
  }
  // Keep this specific chart synchronized even if ArcGIS renders its popup
  // outside the React map element. The event also works after popup reopening.
  const updateSelected = (event: Event) => {
    const date = (event as CustomEvent<string>).detail;
    const xx = date ? x(Date.parse(`${date}T00:00:00Z`)) : NaN;
    const visible = Number.isFinite(xx) ? "visible" : "hidden";
    selectedLine.setAttribute("visibility", visible);
    selectedDot.setAttribute("visibility", visible);
    if (Number.isFinite(xx)) {
      selectedLine.setAttribute("x1", String(xx));
      selectedLine.setAttribute("x2", String(xx));
      selectedDot.setAttribute("cx", String(xx));
    }
  };
  document.addEventListener("mahomet-selected-acquisition", updateSelected);
  // The popup owns the chart's lifetime; stop listening once it is removed.
  let wasConnected = false;
  const observer = new MutationObserver(() => {
    if (wrapper.isConnected) wasConnected = true;
    if (wasConnected && !wrapper.isConnected) {
      document.removeEventListener("mahomet-selected-acquisition", updateSelected);
      observer.disconnect();
    }
  });
  // ArcGIS may attach popup content asynchronously.
  observer.observe(document.body, { childList: true, subtree: true });
  for (const [label, time] of [["Jul", "2026-07-02"], ["Aug", "2026-08-01"], ["Sep", "2026-09-01"], ["Oct", "2026-10-01"]] as const) {
    element("text", { x: String(x(Date.parse(`${time}T00:00:00Z`))), y: String(H-8), "text-anchor": "middle", fill: "#475569", "font-size": "10" }, label);
  }
  wrapper.appendChild(svg);
  const legend = document.createElement("div");
  legend.className = "groundwater-chart-legend";
  legend.textContent = `Daily mean · ${points.length} days · ${telemetry.points.length.toLocaleString()} readings`;
  wrapper.appendChild(legend);
  const key = document.createElement("div");
  key.className = "groundwater-chart-key";
  key.textContent = "Teal: groundwater";
  wrapper.appendChild(key);
  const note = document.createElement("div");
  note.className = "groundwater-chart-note";
  note.textContent = "Units/datum unverified. Surface soil moisture is not a direct measure of confined groundwater levels. Historical annual withdrawals cannot explain changes during individual satellite intervals.";
  wrapper.appendChild(note);
  return wrapper;
}

function wellPopupContent(attributes: Record<string, unknown>, data: GroundwaterDataset | null, dates: string[], selectedDate?: string, wellProperties?: Record<string, Record<string, unknown>>): HTMLElement {
  const root = document.createElement("div");
  root.className = "groundwater-popup";
  const name = String(attributes.well ?? "");
  const properties = { ...(wellProperties?.[name] ?? {}), ...Object.fromEntries(Object.entries(attributes).filter(([, value]) => value !== null && value !== undefined)) };
  const fields: [string, string][] = [
    ["Aquifer", "aquifer"], ["Type", "aquifer_type"], ["Readings", "measurement_frequency"],
    ["Days with observations (of 109)", "study_days_with_data"], ["Valid NISAR dates (of 9)", "nisar_valid_dates"],
  ];
  const summary = document.createElement("dl");
  summary.className = "groundwater-popup-fields";
  summary.style.display = "grid";
  summary.style.gridTemplateColumns = "minmax(0, 1fr) auto";
  summary.style.gap = "3px 10px";
  summary.style.margin = "0 0 10px";
  for (const [label, field] of fields) {
    const dt = document.createElement("dt"); dt.textContent = label; dt.style.margin = "0";
    const dd = document.createElement("dd"); dd.textContent = String(properties[field] ?? "—");
    dd.style.margin = "0"; dd.style.fontWeight = "600"; dd.style.textAlign = "right";
    summary.append(dt, dd);
  }
  root.appendChild(summary);
  const well = data?.wells[name];
  if (well) {
    const heading = document.createElement("strong");
    heading.textContent = "Groundwater observations · 2026";
    root.appendChild(heading);
    root.appendChild(groundwaterChart(well, dates, selectedDate));
  } else {
    const message = document.createElement("p");
    message.textContent = data ? "No matching groundwater series for this well." : "Groundwater chart data not loaded yet. Reopen the well to view its chart.";
    root.appendChild(message);
  }
  return root;
}

export default function App() {
  const container = useRef<HTMLDivElement>(null);
  const viewRef = useRef<MapView | null>(null);
  const layerRef = useRef<ImageryTileLayer | null>(null);
  const boundaryRef = useRef<GeoJSONLayer | null>(null);
  const wellsRef = useRef<GeoJSONLayer | null>(null);
  const countiesRef = useRef<GeoJSONLayer | null>(null);
  const citiesRef = useRef<GeoJSONLayer | null>(null);
  const [showContext, setShowContext] = useState(true);
  const [showWells, setShowWells] = useState(true);
  const [showBoundary, setShowBoundary] = useState(true);
  const hasZoomed = useRef(false);
  const [manifest, setManifest] = useState<AcquisitionManifest | null>(null);
  const [dateIndex, setDateIndex] = useState(0);
  const [precipitation, setPrecipitation] = useState<PrecipitationManifest | null>(null);
  const [precipitationError, setPrecipitationError] = useState<string | null>(null);
  const [mode, setMode] = useState<DisplayMode>("moisture");
  const [status, setStatus] = useState("Loading acquisitions…");
  const groundwaterRef = useRef<GroundwaterDataset | null>(null);
  const wellPropertiesRef = useRef<Record<string, Record<string, unknown>>>({});
  const nisarDatesRef = useRef<string[]>([]);
  const selectedDateRef = useRef<string | undefined>(undefined);
  const [groundwaterError, setGroundwaterError] = useState<string | null>(null);
  const { data: validation, error: validationError } = useValidationData();
  const validationRef = useRef<ValidationData | null>(null);
  validationRef.current = validation;
  const selectedKeyRef = useRef<string | null>(null);
  const coverageRendererRef = useRef<ClassBreaksRenderer | null>(null);
  const noDataRef = useRef<ImageryTileLayer | null>(null);
  const bondvilleRef = useRef<GraphicsLayer | null>(null);
  const tourButtonRef = useRef<HTMLButtonElement>(null);
  const sideRef = useRef<HTMLElement>(null);
  const homeExtentRef = useRef<__esri.Extent | null>(null);
  const [wellColorBy, setWellColorBy] = useState<WellColorBy>("response");
  const [selectedWell, setSelectedWell] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>("seasonal");
  const [showNoData, setShowNoData] = useState(false);
  const [rasterSize, setRasterSize] = useState<number | null>(null);
  const [tourIndex, setTourIndex] = useState<number | null>(null);
  const tourSaved = useRef<{ mode: DisplayMode; dateIndex: number; panel: Panel; wellColorBy: WellColorBy; selectedWell: string | null } | null>(null);
  const urlRead = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${import.meta.env.BASE_URL}data/isws_candidate_wells.geojson`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Well metadata HTTP ${response.status}`);
        return await response.json() as { features: { properties: Record<string, unknown> }[] };
      })
      .then((geojson) => {
        wellPropertiesRef.current = Object.fromEntries(geojson.features
          .filter((feature) => typeof feature.properties?.well === "string")
          .map((feature) => [String(feature.properties.well), feature.properties]));
      })
      .catch((error: unknown) => { if (!controller.signal.aborted) console.warn("Well metadata unavailable:", error); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${import.meta.env.BASE_URL}data/groundwater_timeseries.json`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Groundwater data HTTP ${response.status}`);
        return await response.json() as GroundwaterDataset;
      })
      .then((data) => { groundwaterRef.current = data; })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setGroundwaterError(String(error));
      });
    return () => controller.abort();
  }, []);


  useEffect(() => {
    const controller = new AbortController();
    fetch(`${import.meta.env.BASE_URL}data/acquisitions.json`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Manifest HTTP ${response.status}`);
        return validateManifest(await response.json());
      })
      .then((data) => {
        const ordered = {
          ...data,
          acquisitions: [...data.acquisitions].sort((a, b) => a.date.localeCompare(b.date)),
        };
        setManifest(ordered);
        setStatus("Select an acquisition date");
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setStatus(`Could not load acquisitions.json: ${String(error)}`);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${import.meta.env.BASE_URL}data/precipitation_manifest.json`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Precipitation manifest HTTP ${response.status}`);
        return validatePrecipitationManifest(await response.json());
      })
      .then(setPrecipitation)
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setPrecipitationError(String(error));
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!container.current) return;
    const map = new ArcGISMap({ basemap: undefined });
    const boundary = new GeoJSONLayer({
      url: `${import.meta.env.BASE_URL}data/mahomet_aquifer.geojson`,
      title: "Mahomet Aquifer boundary",
      visible: showBoundary,
      renderer: {
        type: "simple",
        symbol: {
          type: "simple-fill",
          color: [0, 0, 0, 0],
          outline: { color: [123, 44, 191, 1], width: 2.5 },
        },
      },
    });
    map.add(boundary);
    const wells = new GeoJSONLayer({
      url: `${import.meta.env.BASE_URL}data/isws_candidate_wells.geojson`,
      title: "ISWS candidate groundwater wells",
      visible: showWells,
      outFields: ["*"],
      renderer: {
        type: "class-breaks",
        field: "nisar_valid_dates",
        classBreakInfos: [
          {
            minValue: 0,
            maxValue: 8,
            label: "Partial NISAR coverage (3–8 dates)",
            symbol: {
              type: "simple-marker",
              style: "circle",
              color: [245, 158, 11, 0.95],
              size: 9,
              outline: { color: [30, 41, 59, 1], width: 1 },
            },
          },
          {
            minValue: 9,
            maxValue: 9,
            label: "Complete NISAR coverage (9 dates)",
            symbol: {
              type: "simple-marker",
              style: "circle",
              color: [16, 185, 129, 0.95],
              size: 10,
              outline: { color: [30, 41, 59, 1], width: 1 },
            },
          },
        ],
      },
      popupTemplate: {
        title: "ISWS well {well}",
        content: (event: { graphic: __esri.Graphic }) => {
          const root = wellPopupContent(
            event.graphic.attributes as Record<string, unknown>,
            groundwaterRef.current,
            nisarDatesRef.current,
            selectedDateRef.current,
            wellPropertiesRef.current,
          );
          const v = validationRef.current;
          if (v) {
            const name = String(event.graphic.attributes?.well ?? "");
            root.insertBefore(
              wellResponseContent(v.wells.wells.find((w) => w.well === name), v.wells, v.intervals.intervals, selectedKeyRef.current),
              root.children[1] ?? null,
            );
          }
          return root;
        },
      },
    });
    // Geographic context: county outlines and a few city reference points.
    // Insert counties below aquifer and wells; city labels stay above the imagery.
    const counties = new GeoJSONLayer({
      url: `${import.meta.env.BASE_URL}data/illinois_context_counties.geojson`,
      title: "County boundaries",
      visible: showContext,
      renderer: {
        type: "simple",
        symbol: {
          type: "simple-fill",
          color: [0, 0, 0, 0],
          outline: { color: [85, 95, 110, 0.75], width: 0.8 },
        },
      },
      labelingInfo: [{
        // Keep county names for closer inspection; avoid clutter at the initial extent.
        minScale: 1500000,
        labelExpressionInfo: { expression: "$feature.NAME" },
        labelPlacement: "always-horizontal",
        symbol: {
          type: "text",
          color: [52, 65, 80, 0.9],
          haloColor: [255, 255, 255, 0.85],
          haloSize: 1,
          font: { size: 9, family: "Arial" },
        },
      }],
      labelsVisible: true,
    });
    map.add(counties, 0);
    countiesRef.current = counties;
    counties.load().catch((error: unknown) => console.error("County context failed to load:", error));

    const cities = new GeoJSONLayer({
      url: `${import.meta.env.BASE_URL}data/illinois_context_cities.geojson`,
      title: "Major cities",
      visible: showContext,
      renderer: {
        type: "simple",
        symbol: {
          type: "simple-marker",
          style: "circle",
          color: [36, 51, 65, 0.9],
          size: 5,
          outline: { color: [255, 255, 255, 0.95], width: 1 },
        },
      },
      labelingInfo: [{
        labelExpressionInfo: { expression: "$feature.name" },
        labelPlacement: "above-right",
        symbol: {
          type: "text",
          color: [32, 45, 60, 1],
          haloColor: [255, 255, 255, 1],
          haloSize: 1.5,
          font: { size: 9, weight: "bold", family: "Arial" },
        },
      }],
      labelsVisible: true,
    });
    map.add(cities);
    citiesRef.current = cities;
    cities.load().catch((error: unknown) => console.error("City context failed to load:", error));
    // Order: raster below, aquifer outline and well points above.
    map.add(wells);
    wellsRef.current = wells;
    coverageRendererRef.current = (wells.renderer as ClassBreaksRenderer | null) ?? null;
    // Ground-check site: the USCRN soil moisture probe at Bondville.
    const bondville = new GraphicsLayer({ title: copy.bondvilleMarker });
    const probePoint = new Point({ latitude: 40.05, longitude: -88.37 });
    bondville.addMany([
      new Graphic({ geometry: probePoint, attributes: { bondville: true },
        symbol: { type: "simple-marker", style: "square", color: [124, 58, 237, 1], size: 11, outline: { color: [255, 255, 255, 1], width: 1.5 } } }),
      new Graphic({ geometry: probePoint, attributes: { bondville: true },
        symbol: { type: "text", text: copy.bondvilleMarker, color: [76, 29, 149, 1], haloColor: [255, 255, 255, 1], haloSize: 1.5,
          xoffset: 0, yoffset: -16, font: { size: 9, weight: "bold", family: "Arial" } } }),
    ]);
    map.add(bondville);
    bondvilleRef.current = bondville;
    wells.load().catch((error: unknown) => console.error("ISWS wells failed to load:", error));

    boundaryRef.current = boundary;
    boundary.load().catch((error: unknown) => console.error("Aquifer boundary failed to load:", error));
    const view = new MapView({
      container: container.current,
      map,
      center: [-88.2, 40.3],
      zoom: 8,
      popup: {
        // Keep well details at the edge of the map instead of covering its center.
        dockEnabled: true,
        dockOptions: { buttonEnabled: true, breakpoint: false, position: "bottom-right" },
      },
    });
    viewRef.current = view;
    // Clicking the probe marker opens the ground-check panel.
    const clickHandle = view.on("click", (event) => {
      view.hitTest(event, { include: [bondville] }).then((hit) => {
        if (hit.results.length) setPanel("bondville");
      }).catch(() => {});
    });
    // Track which well's popup is open, so the seasonal panel can draw that well's curve.
    const popupHandle = reactiveUtils.watch(
      () => view.popup?.selectedFeature,
      (feature) => {
        const name = feature?.layer === wells ? feature.attributes?.well : undefined;
        if (typeof name === "string") setSelectedWell(name);
      },
    );
    return () => {
      clickHandle.remove();
      popupHandle.remove();
      viewRef.current = null;
      layerRef.current = null;
      boundaryRef.current = null;
      wellsRef.current = null;
      countiesRef.current = null;
      citiesRef.current = null;
      bondvilleRef.current = null;
      view.destroy();
    };
  }, []);

  useEffect(() => {
    if (boundaryRef.current) boundaryRef.current.visible = showBoundary;
  }, [showBoundary]);

  useEffect(() => {
    if (wellsRef.current) wellsRef.current.visible = showWells;
  }, [showWells]);

  useEffect(() => {
    if (countiesRef.current) countiesRef.current.visible = showContext;
    if (citiesRef.current) citiesRef.current.visible = showContext;
  }, [showContext]);

  const acquisition = manifest?.acquisitions[dateIndex];
  nisarDatesRef.current = manifest?.acquisitions.map((item) => item.date) ?? [];
  selectedDateRef.current = acquisition?.date;
  useEffect(() => {
    if (acquisition?.date) {
      document.dispatchEvent(new CustomEvent("mahomet-selected-acquisition", { detail: acquisition.date }));
    }
  }, [acquisition?.date]);
  const previous = dateIndex > 0 ? manifest?.acquisitions[dateIndex - 1] : undefined;
  const change = manifest?.changes.find(
    (item) => item.from === previous?.date && item.to === acquisition?.date,
  );
  const precipitationInterval = precipitation?.intervals.find(
    (item) => item.from === previous?.date && item.to === acquisition?.date,
  );
  const activeMode: DisplayMode = mode === "change" && !change
    ? "moisture"
    : mode === "precipitation" && !previous
      ? "moisture"
      : mode;
  const choice = useMemo(() => {
    if (!acquisition) return null;
    if (activeMode === "change" && change) {
      return {
        filename: change.file,
        label: `${formatDate(change.from)} – ${formatDate(change.to)} · change`,
        mode: "change" as DisplayMode,
      };
    }
    if (activeMode === "precipitation") {
      if (!precipitationInterval) return null;
      return {
        filename: precipitationInterval.file,
        label: `${formatDate(precipitationInterval.from)} – ${formatDate(precipitationInterval.to)} · accumulated precipitation`,
        mode: "precipitation" as DisplayMode,
      };
    }
    return {
      filename: acquisition.file,
      label: `${formatDate(acquisition.date)} · soil moisture`,
      mode: "moisture" as DisplayMode,
    };
  }, [acquisition, activeMode, change, precipitationInterval]);

  const selKey = previous && acquisition ? intervalKey(previous.date, acquisition.date) : null;
  selectedKeyRef.current = selKey;
  const intervalEntry = validation?.intervals.intervals.find((i) => i.from === previous?.date && i.to === acquisition?.date) ?? null;
  const maxRainIndex = validation && manifest
    ? manifest.acquisitions.findIndex((a) => a.date === validation.intervals.intervals.find((i) => i.is_max_rain)?.to)
    : -1;

  // F2: colour wells by their response in the selected interval, or by NISAR coverage (original renderer).
  useEffect(() => {
    const wells = wellsRef.current;
    if (!wells) return;
    if (wellColorBy === "response" && validation) wells.renderer = responseRenderer(validation.wells, selKey);
    else if (coverageRendererRef.current) wells.renderer = coverageRendererRef.current.clone();
  }, [wellColorBy, validation, selKey]);

  // F5: grey overlay of pixels with no retrieval, for the selected date (moisture) or interval (change/rain).
  const noDataFile = activeMode === "moisture" ? acquisition?.file : change?.file;
  useEffect(() => {
    const view = viewRef.current;
    if (!view?.map || !showNoData || !noDataFile) return;
    const layer = new ImageryTileLayer({
      url: new URL(`${import.meta.env.BASE_URL}data/${noDataFile}`, window.location.origin).href,
      title: copy.coverageLegend,
      opacity: 0.75,
      rasterFunction: rasterFunctionUtils.colormap({
        colormap: [[1, ...NO_DATA_GRAY]],
        raster: rasterFunctionUtils.isNull({}),
      }),
    });
    // Directly above the soil moisture raster, below outlines and wells.
    view.map.add(layer, Math.min(view.map.layers.indexOf(layerRef.current!) + 1, view.map.layers.length));
    noDataRef.current = layer;
    return () => {
      if (!view.destroyed) view.map?.remove(layer);
      if (noDataRef.current === layer) noDataRef.current = null;
      if (!layer.destroyed) layer.destroy();
    };
  }, [showNoData, noDataFile]);

  const openWell = useCallback(async (name: string, zoom?: number) => {
    const view = viewRef.current, wells = wellsRef.current;
    if (!view || !wells) return;
    await wells.load();
    const result = await wells.queryFeatures({
      where: `well = '${name.replace(/'/g, "''")}'`, returnGeometry: true, outFields: ["*"],
    });
    const feature = result.features[0];
    if (!feature?.geometry) return;
    if (zoom) await view.goTo({ target: feature.geometry, zoom }).catch(() => {});
    setSelectedWell(name);
    await view.openPopup({ features: [feature], location: feature.geometry as Point, shouldFocus: false });
  }, []);

  // F7: shareable link ?date=YYYYMMDD&mode=change&well=ID. Read once, then keep the URL in sync.
  useEffect(() => {
    if (urlRead.current || !manifest) return;
    urlRead.current = true;
    const params = new URLSearchParams(window.location.search);
    const i = manifest.acquisitions.findIndex((a) => a.date === params.get("date"));
    if (i >= 0) setDateIndex(i);
    const m = params.get("mode");
    if (m && (MODES as string[]).includes(m)) setMode(m as DisplayMode);
    const w = params.get("well");
    if (w) { setSelectedWell(w); openWell(w).catch(() => {}); }
  }, [manifest, openWell]);
  useEffect(() => {
    if (!urlRead.current || !acquisition) return;
    const params = new URLSearchParams();
    params.set("date", acquisition.date);
    params.set("mode", activeMode);
    if (selectedWell) params.set("well", selectedWell);
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
  }, [acquisition, activeMode, selectedWell]);

  const tourSteps: TourStep[] = useMemo(() => {
    if (!validation || !manifest || maxRainIndex < 0) return [];
    const storm = validation.intervals.intervals.find((i) => i.is_max_rain)!;
    const counts = stormCounts(validation.wells);
    const well = tourWell(validation.wells);
    const home = () => {
      const view = viewRef.current;
      if (view && homeExtentRef.current) view.goTo(homeExtentRef.current).catch(() => {});
      view?.closePopup();
      sideRef.current?.scrollTo({ top: 0 });
    };
    return [
      { id: "intro", title: copy.tour.intro.title, text: copy.tour.intro.text(),
        apply: () => { setMode("moisture"); setDateIndex(0); home(); } },
      { id: "storm", title: copy.tour.storm.title,
        text: copy.tour.storm.text(validation.wells.storm_dates, fmtRain(storm.rain_in_mean), fmtChange(storm.change_mean)),
        apply: () => { setMode("precipitation"); setDateIndex(maxRainIndex); home(); } },
      { id: "wells", title: copy.tour.wells.title, text: copy.tour.wells.text(counts.n_beat, counts.n_hist, counts.n_rose),
        apply: () => {
          setMode("change"); setDateIndex(maxRainIndex); setWellColorBy("response"); setShowWells(true); setPanel("seasonal");
          if (well) openWell(well, TOUR_ZOOM_WELL).catch(() => {});
        } },
      { id: "limits", title: copy.tour.limits.title, text: copy.tour.limits.text(),
        apply: () => {
          setPanel("bondville");
          window.setTimeout(() => {
            const side = sideRef.current, tabs = side?.querySelector(".tabs");
            if (side && tabs) side.scrollTo({ top: tabs.getBoundingClientRect().top - side.getBoundingClientRect().top + side.scrollTop });
          }, 50);
          const view = viewRef.current;
          view?.closePopup();
          view?.goTo({ target: new Point({ latitude: 40.05, longitude: -88.37 }), zoom: TOUR_ZOOM_BONDVILLE }).catch(() => {});
        } },
    ];
  }, [validation, manifest, maxRainIndex, openWell]);

  const startTour = () => {
    tourSaved.current = { mode, dateIndex, panel, wellColorBy, selectedWell };
    setTourIndex(0);
  };
  const exitTour = useCallback(() => {
    const saved = tourSaved.current;
    setTourIndex(null);
    if (saved) {
      setMode(saved.mode); setDateIndex(saved.dateIndex); setPanel(saved.panel); setWellColorBy(saved.wellColorBy);
      setSelectedWell(saved.selectedWell);
    }
    tourSaved.current = null;
    viewRef.current?.closePopup();
    // The button is disabled while the tour runs; focus it after it re-enables.
    window.setTimeout(() => tourButtonRef.current?.focus(), 0);
  }, []);
  const tourOnLimits = tourIndex !== null && tourSteps[tourIndex]?.id === "limits";

  useEffect(() => {
    const view = viewRef.current;
    if (!view || !view.map || !choice) return;
    let cancelled = false;
    const layer = new ImageryTileLayer({
      url: new URL(`${import.meta.env.BASE_URL}data/${choice.filename}`, window.location.origin).href,
      title: choice.label,
      opacity: 0.85,
    });

    const oldLayer = layerRef.current;
    if (oldLayer) view.map.remove(oldLayer);
    layerRef.current = layer;
    // Keep the aquifer outline above the raster, even after date changes.
    view.map.add(layer, 0);
    setStatus(`Loading ${choice.label}…`);

    layer.load().then(async () => {
      if (cancelled || view.destroyed) return;
      const info = layer.serviceRasterInfo;
      setRasterSize(info ? info.width * info.height : null);
      layer.renderer = new RasterStretchRenderer({
        stretchType: "min-max",
        useGamma: false,
        customStatistics: [{
          min: choice.mode === "change" ? -0.2 : 0,
          max: choice.mode === "change" ? 0.2 : choice.mode === "precipitation" ? 6 : 0.6,
          avg: choice.mode === "change" ? 0 : choice.mode === "precipitation" ? 3 : 0.3,
          stddev: choice.mode === "precipitation" ? 1 : 0.1,
        }],
        colorRamp: ramp(choice.mode),
      });
      console.log("Renderer:", layer.renderer?.toJSON());
      console.log("Custom statistics:", (layer.renderer as RasterStretchRenderer).customStatistics);
      console.log("Raster info:", layer.serviceRasterInfo?.toJSON() ?? "Not exposed on ImageryTileLayer");
      console.log("Layer type:", layer.type);
      console.log("Layer URL:", layer.url);
      console.log("Layer full extent:", layer.fullExtent?.toJSON());

      try {
        const layerView = await view.whenLayerView(layer);
        if (cancelled || view.destroyed) return;
        console.log("Layer view:", layerView);
        console.log("Layer view visible:", layerView.visible);
        console.log("Layer view suspended:", layerView.suspended);
      } catch (error) {
        if (!cancelled && !view.destroyed) {
          console.error("Could not create imagery layer view:", error);
          setStatus(`Raster loaded, but layer view failed: ${String(error)}`);
        }
        return;
      }

      if (cancelled || view.destroyed) return;
      setStatus(`Loaded: ${choice.label}`);
      // Zoom only on first successful raster; changing dates should not reset the user's view.
      if (!hasZoomed.current && layer.fullExtent) {
        hasZoomed.current = true;
        homeExtentRef.current = layer.fullExtent.clone();
        view.goTo(layer.fullExtent).catch(() => {});
      }
    }).catch((error: unknown) => {
      if (!cancelled) {
        console.error("Could not load raster:", error);
        setStatus(`Could not load raster: ${String(error)}`);
      }
    });

    return () => {
      cancelled = true;
      if (!view.destroyed) view.map?.remove(layer);
      if (layerRef.current === layer) layerRef.current = null;
      if (!layer.destroyed) layer.destroy();
    };
  }, [choice]);

  const maxIndex = Math.max(0, (manifest?.acquisitions.length ?? 1) - 1);
  return (
    <div className="app">
      <style>{`
        /* Keep the docked well summary compact, without changing the map layout. */
        .app .esri-popup--is-docked .esri-popup__main-container {
          width: min(370px, 92vw);
          max-width: min(370px, 92vw);
          max-height: min(610px, 78vh);
        }
        .app .esri-popup--is-docked .esri-popup__content {
          max-height: min(540px, 70vh);
          overflow-y: auto;
        }
      `}</style>
      <header className="app-header">
        <div>
          <h1>Mahomet Moisture Observatory</h1>
          <p>NISAR L3 SME2 · surface soil moisture time series</p>
        </div>
        <div className="header-buttons">
          <button type="button" ref={tourButtonRef} onClick={startTour} disabled={!tourSteps.length || tourIndex !== null}>Guided tour</button>
          <button type="button" onClick={() => setPanel("limits")} aria-controls="side-panel">{copy.limitsTitle}</button>
        </div>
      </header>
      <section className="controls" style={{ display: "flex", flexWrap: "wrap", gap: "1rem", alignItems: "center" }}>
        <label htmlFor="date">Acquisition date</label>
        <button type="button" disabled={!manifest || dateIndex === 0}
          onClick={() => setDateIndex((i) => Math.max(0, i - 1))}
          aria-label="Previous acquisition date" title="Previous acquisition">◀</button>
        <input
          id="date" type="range" min={0} max={maxIndex} step={1}
          value={Math.min(dateIndex, maxIndex)}
          disabled={!manifest}
          onChange={(event) => setDateIndex(Number(event.target.value))}
          aria-valuetext={acquisition ? formatDate(acquisition.date) : "Loading"}
          style={{ minWidth: 190, flex: "1 1 190px" }}
        />
        <button type="button" disabled={!manifest || dateIndex >= maxIndex}
          onClick={() => setDateIndex((i) => Math.min(maxIndex, i + 1))}
          aria-label="Next acquisition date" title="Next acquisition">▶</button>
        <strong style={{ minWidth: 155 }}>
          {acquisition ? formatDate(acquisition.date) : "Loading…"}
        </strong>
        <label htmlFor="mode">Display</label>
        <select id="mode" value={activeMode} disabled={!manifest}
          onChange={(event) => setMode(event.target.value as DisplayMode)}>
          <option value="moisture">Soil moisture</option>
          <option value="change" disabled={!change}>Change from previous date</option>
          <option value="precipitation" disabled={!previous}>Accumulated precipitation</option>
        </select>
        <label style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
          <input type="checkbox" checked={showBoundary}
            onChange={(event) => setShowBoundary(event.target.checked)} />
          Aquifer boundary
        </label>
         <label style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
           <input type="checkbox" checked={showContext}
             onChange={(event) => setShowContext(event.target.checked)} />
           Geographic context
         </label>
        <label style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
          <input type="checkbox" checked={showWells}
            onChange={(event) => setShowWells(event.target.checked)} />
          Groundwater wells (30)
        </label>
        <label htmlFor="well-color">Color wells by</label>
        <select id="well-color" value={wellColorBy} onChange={(event) => setWellColorBy(event.target.value as WellColorBy)}>
          <option value="response">Response</option>
          <option value="coverage">NISAR coverage</option>
        </select>
        <label style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
          <input type="checkbox" checked={showNoData} onChange={(event) => setShowNoData(event.target.checked)} />
          {copy.coverageToggle}
        </label>
        <span role="status">{status}{activeMode === "moisture" && acquisition
          ? ` · NISAR retrieval on ${rasterSize ? fmtPct(acquisition.valid_pixels / rasterSize) : "no data"}% of the area`
          : intervalEntry ? ` · pixels valid on both dates: ${fmtPct(intervalEntry.valid_share)}% of the area` : ""}</span>
        {validationError && <span role="alert">Validation panels unavailable: {validationError}</span>}
        {groundwaterError && <span role="alert">Groundwater charts unavailable: {groundwaterError}</span>}
      </section>
      {manifest && (
        <section style={{ padding: "0.4rem 1rem", display: "flex", flexWrap: "wrap", gap: "1rem", alignItems: "center" }}>
          <span>{activeMode === "change" && change
            ? `Change: ${formatDate(change.from)} to ${formatDate(change.to)}`
            : activeMode === "precipitation" && previous && acquisition
              ? `Rainfall: ${formatDate(previous.date)} to ${formatDate(acquisition.date)}`
              : `Acquisition ${dateIndex + 1} of ${manifest.acquisitions.length}`}</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
            <span>{activeMode === "change" ? "Drier (−0.2)" : activeMode === "precipitation" ? "0" : "Drier (0.0)"}</span>
            <span aria-hidden="true" style={{ width: 145, height: 14, border: "1px solid #888",
               background: legendGradient(activeMode) }} />
            <span>{activeMode === "change" ? "Wetter (+0.2)" : activeMode === "precipitation" ? "6+" : "Wetter (0.6)"}</span>
          </span>
          <span>{activeMode === "precipitation" ? "inches (approximate)" : "m³/m³"}</span>
          {showNoData && <span><span aria-hidden="true" className="swatch" style={{ background: "rgb(128,128,128)", width: 12, height: 12 }} /> {copy.coverageLegend}</span>}
          {activeMode === "precipitation" && precipitationError &&
            <span role="alert">Precipitation manifest error: {precipitationError}</span>}
        </section>
      )}
      <section style={{ padding: "0.2rem 1rem", display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "center" }}>
        {wellColorBy === "coverage" || !validation ? <>
          <span><span aria-hidden="true" style={{ color: "#10b981" }}>●</span> 9 of 9 valid NISAR dates (16 wells)</span>
          <span><span aria-hidden="true" style={{ color: "#f59e0b" }}>●</span> 3–8 valid NISAR dates (14 wells)</span>
          <span style={{ fontSize: "0.85em" }}>Well markers are static; the selected NISAR date is highlighted on groundwater charts.</span>
        </> : <WellsLegend data={validation.wells} intervalKey={selKey} isMaxRain={!!intervalEntry?.is_max_rain} />}
      </section>
      <div className="main">
        <div ref={container} className="map" />
        <aside className="side" id="side-panel" aria-label="Validation and context" ref={sideRef}>
          {validation ? <>
            <IntervalCard intervals={validation.intervals.intervals} selected={intervalEntry} changeEps={validation.intervals.change_eps}
              onSelectInterval={(to) => { const i = manifest?.acquisitions.findIndex((a) => a.date === to) ?? -1; if (i >= 0) setDateIndex(i); }} />
            <div className="tabs" role="tablist" aria-label="Context panels">
              {PANELS.map((p) => (
                <button key={p.id} type="button" role="tab" id={`tab-${p.id}`} aria-selected={panel === p.id} aria-controls={`tabpanel-${p.id}`}
                  tabIndex={panel === p.id ? 0 : -1} onClick={() => setPanel(p.id)}
                  onKeyDown={(e) => {
                    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                    const k = PANELS.findIndex((q) => q.id === panel);
                    const next = PANELS[(k + (e.key === "ArrowRight" ? 1 : PANELS.length - 1)) % PANELS.length];
                    setPanel(next.id);
                    document.getElementById(`tab-${next.id}`)?.focus();
                  }}>{p.label}</button>
              ))}
            </div>
            <div role="tabpanel" id={`tabpanel-${panel}`} aria-labelledby={`tab-${panel}`}>
              {panel === "seasonal" && <SeasonalPanel data={validation.seasonality} selectedWell={selectedWell} />}
              {panel === "bondville" && <BondvillePanel data={validation.bondville} appDates={manifest?.acquisitions.map((a) => a.date) ?? []} />}
              {panel === "limits" && <LimitsPanel stormDates={validation.wells.storm_dates} />}
            </div>
            {tourOnLimits && panel !== "limits" && <LimitsPanel stormDates={validation.wells.storm_dates} />}
          </> : <p className="panel">{validationError ? `Validation panels unavailable: ${validationError}` : "Loading validation data…"}</p>}
        </aside>
        {tourIndex !== null && tourSteps.length > 0 &&
          <Tour steps={tourSteps} index={tourIndex} onIndex={setTourIndex} onExit={exitTour} />}
      </div>
      <footer>
        Soil moisture/change: m³/m³ (positive change = wetter), EPSG:6933. Precipitation: inches, EPSG:4326. MRMS intervals use UTC-midnight boundaries.
        {manifest && ` ${manifest.acquisitions.length} acquisitions · ${manifest.changes.length} intervals.`}
      </footer>
    </div>
  );
}

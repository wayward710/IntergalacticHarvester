export type Acquisition = {
  date: string;
  file: string;
  valid_pixels: number;
};

export type Change = {
  from: string;
  to: string;
  file: string;
  paired_pixels: number;
};

export type AcquisitionManifest = {
  crs: string;
  units: string;
  nodata: number;
  quality: string;
  acquisitions: Acquisition[];
  changes: Change[];
};

export type PrecipitationInterval = {
  from: string;
  to: string;
  file: string;
  units: string;
};

export type PrecipitationManifest = {
  crs: string;
  units: string;
  intervals: PrecipitationInterval[];
};

export type DisplayMode = "moisture" | "change" | "precipitation";

export function formatDate(date: string): string {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(4, 6)) - 1;
  const day = Number(date.slice(6, 8));
  return new Intl.DateTimeFormat("en-US", {
    month: "long", day: "numeric", year: "numeric", timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month, day)));
}

export function validateManifest(value: unknown): AcquisitionManifest {
  if (!value || typeof value !== "object") throw new Error("Invalid acquisitions manifest");
  const m = value as Partial<AcquisitionManifest>;
  if (!Array.isArray(m.acquisitions) || m.acquisitions.length === 0 || !Array.isArray(m.changes)) {
    throw new Error("Manifest must contain acquisitions and changes arrays");
  }
  for (const item of m.acquisitions) {
    if (!/^\d{8}$/.test(item.date) || !/^nisar_sm_\d{8}\.tif$/.test(item.file)) {
      throw new Error("Invalid acquisition entry in manifest");
    }
  }
  for (const item of m.changes) {
    if (!/^\d{8}$/.test(item.from) || !/^\d{8}$/.test(item.to) ||
        !/^nisar_sm_change_\d{8}_\d{8}\.tif$/.test(item.file)) {
      throw new Error("Invalid change entry in manifest");
    }
  }
  return m as AcquisitionManifest;
}

export function validatePrecipitationManifest(value: unknown): PrecipitationManifest {
  if (!value || typeof value !== "object") throw new Error("Invalid precipitation manifest");
  const m = value as Partial<PrecipitationManifest>;
  if (m.crs !== "EPSG:4326" || m.units !== "inches" || !Array.isArray(m.intervals)) {
    throw new Error("Precipitation manifest must contain EPSG:4326, inches, and intervals");
  }
  for (const item of m.intervals) {
    if (!/^\d{8}$/.test(item.from) || !/^\d{8}$/.test(item.to) ||
        !/^mrms_precip_\d{8}_\d{8}\.tif$/.test(item.file) || item.units !== "inches") {
      throw new Error("Invalid precipitation interval entry");
    }
  }
  return m as PrecipitationManifest;
}

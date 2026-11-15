import type { WellsResponse } from "../validationData";
import { stormCounts } from "../validationData";
import { CLASS_STYLE, classCounts } from "../wellsResponse";
import { copy } from "../copy";

type Props = { data: WellsResponse; intervalKey: string | null; isMaxRain: boolean };

export default function WellsLegend({ data, intervalKey, isMaxRain }: Props) {
  const items = copy.wellsLegendItems(String(data.flat_threshold_ft));
  const counts = classCounts(data, intervalKey);
  const storm = stormCounts(data);
  if (!intervalKey) {
    return <span className="wells-legend">{copy.wellsLegendTitle}: {copy.intervalFirst}</span>;
  }
  return (
    <div className="wells-legend" aria-live="polite">
      {isMaxRain && <p className="storm-summary">{copy.wellsStormSummary(storm.n_beat, storm.n_hist, storm.n_rose)}</p>}
      <strong>{copy.wellsLegendTitle}</strong>
      <ul>
        {(["rose", "flat", "fell", "none"] as const).map((k) => (
          <li key={k}>
            <span aria-hidden="true" className={`glyph glyph-${k}`} style={{ color: CLASS_STYLE[k].color }}>{CLASS_STYLE[k].glyph}</span>
            {items[k]} <b>({counts[k]})</b>
          </li>
        ))}
      </ul>
      <span className="sr-only">{`${counts.rose} rose, ${counts.flat} flat, ${counts.fell} fell, ${counts.none} no reading.`}</span>
    </div>
  );
}

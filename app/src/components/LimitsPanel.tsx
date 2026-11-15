import { copy } from "../copy";

export default function LimitsPanel({ stormDates }: { stormDates: string }) {
  return (
    <section className="panel" aria-labelledby="limits-title">
      <h2 id="limits-title">{copy.limitsTitle}</h2>
      <ol className="limits">
        {copy.limits(stormDates).map((t) => <li key={t}>{t}</li>)}
      </ol>
    </section>
  );
}

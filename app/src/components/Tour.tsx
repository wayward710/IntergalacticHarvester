import { useEffect, useRef } from "react";

export type TourStep = { id: string; title: string; text: string; apply: () => void };

type Props = { steps: TourStep[]; index: number; onIndex: (i: number) => void; onExit: () => void };

/** Step card for the guided tour. Steps are data; each step's apply() uses the app's own state setters. */
export default function Tour({ steps, index, onIndex, onExit }: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const step = steps[index];
  useEffect(() => {
    step?.apply();
    headingRef.current?.focus();
    // apply() is recreated each render; run it only when the step changes.
  }, [index]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onExit(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onExit]);
  if (!step) return null;
  return (
    <div className="tour-card" role="dialog" aria-modal="false" aria-labelledby="tour-title">
      <p className="tour-progress">Step {index + 1} of {steps.length}</p>
      <h2 id="tour-title" tabIndex={-1} ref={headingRef}>{step.title}</h2>
      <p aria-live="polite">{step.text}</p>
      <div className="tour-buttons">
        <button type="button" onClick={() => onIndex(index - 1)} disabled={index === 0}>Back</button>
        {index < steps.length - 1
          ? <button type="button" onClick={() => onIndex(index + 1)}>Next</button>
          : <button type="button" onClick={onExit}>Finish</button>}
        <button type="button" onClick={onExit}>Exit (Esc)</button>
      </div>
    </div>
  );
}

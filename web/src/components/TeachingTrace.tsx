import { useState } from 'react';
import type { TeachingTrace as Trace } from '../../../shared/types';

export function TeachingTrace({ trace }: { trace: Trace }) {
  const [index, setIndex] = useState(0);
  const step = trace.steps[index];
  return (
    <figure className="teaching-trace">
      <figcaption>{trace.title}</figcaption>
      <p className="muted small">Worked example, not a run of your code. Indices start at 0.</p>
      <div className="trace-cells" aria-label="Values under consideration">
        {trace.values.map((value, i) => (
          <div key={i} className={`trace-cell ${step.active.includes(i) ? 'active' : 'discarded'} ${step.focus === i ? 'focus' : ''} ${step.candidate === i ? 'candidate' : ''}`}>
            <span className="trace-index">{i}</span>
            <code>{value}</code>
            <span className="trace-marker">{step.focus === i ? 'Inspect' : ''}{step.focus === i && step.candidate === i ? ' · ' : ''}{step.candidate === i ? 'Saved' : ''}</span>
          </div>
        ))}
      </div>
      <p className="muted small">Filled: still possible · Outline: inspecting · Saved: possible answer · Faded: set aside</p>
      <div aria-live="polite">
        <p>{step.explanation}</p>
        {step.prediction && <p className="trace-prediction">{step.prediction}</p>}
      </div>
      <div className="row trace-controls">
        <button className="button small" disabled={index === 0} onClick={() => setIndex(index - 1)}>Previous</button>
        <span className="muted small">Step {index + 1} of {trace.steps.length}</span>
        <button className="button small" disabled={index === trace.steps.length - 1} onClick={() => setIndex(index + 1)}>Reveal next step</button>
      </div>
    </figure>
  );
}

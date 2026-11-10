import { LEVEL_LABELS, topicName } from '../../../shared/curriculum';
import type { AppState } from '../../../shared/types';
import { navigate } from '../useRoute';

export function Progress({ state }: { state: AppState }) {
  return (
    <div className="page">
      <h1>Progress</h1>
      <p className="lead">
        Guided solves count as practice. A first independent submission that passes without hints moves the topic up.
        Getting help, retrying or studying a solution keeps your level the same. Fresh reviews after a delay check what you remember.
      </p>
      <table className="progress-table">
        <thead>
          <tr>
            <th>Topic</th>
            <th>Level</th>
            <th>Sessions</th>
            <th>Solved</th>
            <th>Independent first tries</th>
          </tr>
        </thead>
        <tbody>
          {state.progress.map((p) => (
            <tr key={p.topic}>
              <td>{topicName(p.topic)}</td>
              <td>
                <span className={`pill ${p.level}`}>{LEVEL_LABELS[p.level]}</span>
              </td>
              <td>{p.sessions}</td>
              <td>{p.solved}</td>
              <td>{p.independentSolved}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="button ghost" onClick={() => navigate('/quiz')}>
        Retake the quiz
      </button>
    </div>
  );
}

import { topicName } from '../../../shared/curriculum';
import type { AppState } from '../../../shared/types';
import { navigate } from '../useRoute';

export function Progress({ state }: { state: AppState }) {
  return (
    <div className="page">
      <h1>Progress</h1>
      <p className="lead">
        Solving a problem on your first submission with two hints or fewer moves a topic up a level. Failing your first
        submission or giving up moves it down one.
      </p>
      <table className="progress-table">
        <thead>
          <tr>
            <th>Topic</th>
            <th>Level</th>
            <th>Sessions</th>
            <th>Solved</th>
          </tr>
        </thead>
        <tbody>
          {state.progress.map((p) => (
            <tr key={p.topic}>
              <td>{topicName(p.topic)}</td>
              <td>
                <span className={`pill ${p.level}`}>{p.level}</span>
              </td>
              <td>{p.sessions}</td>
              <td>{p.solved}</td>
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

import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { formatTime } from '../lib/dates.js';

export default function ShowHours() {
  const { data } = useQuery({ queryKey: ['show-info'], queryFn: () => api('/show-info') });
  const show = data?.showInfo;
  const hours = Array.isArray(show?.hours_json) ? show.hours_json : [];

  return (
    <div className="section container" style={{ maxWidth: 720 }}>
      <h1 className="glow">Show Hours</h1>
      {show && (
        <div className="card">
          <p><strong>{show.venue}</strong></p>
          <p className="muted">{show.address}</p>
          {hours.length > 0 ? (
            <table style={{ width: '100%', marginTop: 12 }}>
              <tbody>
                {hours.map((h) => (
                  <tr key={h.day}>
                    <td><strong>{h.day}</strong></td>
                    <td style={{ textAlign: 'right' }}>{formatTime(h.open)} – {formatTime(h.close)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="muted">Hours will be announced soon.</p>
          )}
        </div>
      )}
    </div>
  );
}

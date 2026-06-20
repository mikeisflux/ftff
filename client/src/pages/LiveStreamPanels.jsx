import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';

// Public livestream panel schedule, grouped by day (Friday/Saturday/Sunday).
const DAYS = ['Friday', 'Saturday', 'Sunday'];

export default function LiveStreamPanels() {
  const { data, isLoading } = useQuery({ queryKey: ['panels'], queryFn: () => api('/panels') });
  const panels = data?.panels ?? [];
  const byDay = (day) => panels.filter((p) => p.day === day);

  return (
    <div className="section container">
      <h1 className="glow">Live Stream Panels</h1>
      <p className="muted">Catch these panels live on our stream throughout the weekend.</p>

      {isLoading ? (
        <p className="muted">Loading…</p>
      ) : panels.length === 0 ? (
        <p className="muted">The panel schedule will be announced soon — check back.</p>
      ) : (
        DAYS.filter((d) => byDay(d).length > 0).map((day) => (
          <section key={day} className="panel-day">
            <h2 className="glow">{day}</h2>
            <ul className="panel-list">
              {byDay(day).map((p) => (
                <li key={p.id} className="panel-item">
                  <div className="panel-time">
                    {p.start_time || 'TBA'}{p.end_time ? `–${p.end_time}` : ''}
                  </div>
                  <div className="panel-body">
                    <h3 className="panel-title">{p.title}</h3>
                    {(p.presenter || p.location) && (
                      <p className="muted panel-meta">
                        {p.presenter}{p.presenter && p.location ? ' · ' : ''}{p.location}
                      </p>
                    )}
                    {p.description && <p className="panel-desc">{p.description}</p>}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

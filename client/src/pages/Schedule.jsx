import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';

// Public show schedule, grouped by day (Friday/Saturday/Sunday).
const DAYS = ['Friday', 'Saturday', 'Sunday'];

export default function Schedule() {
  const { data, isLoading } = useQuery({ queryKey: ['schedule'], queryFn: () => api('/schedule') });
  const events = data?.events ?? [];
  const byDay = (day) => events.filter((e) => e.day === day);

  return (
    <div className="section container">
      <h1 className="glow">Schedule</h1>
      <p className="muted">Everything happening across the weekend, by day.</p>

      {isLoading ? (
        <p className="muted">Loading…</p>
      ) : events.length === 0 ? (
        <p className="muted">The full schedule will be announced soon — check back.</p>
      ) : (
        DAYS.filter((d) => byDay(d).length > 0).map((day) => (
          <section key={day} className="panel-day">
            <h2 className="glow">{day}</h2>
            <ul className="panel-list">
              {byDay(day).map((e) => (
                <li key={e.id} className="panel-item">
                  <div className="panel-time">
                    {e.start_time || 'TBA'}{e.end_time ? `–${e.end_time}` : ''}
                  </div>
                  <div className="panel-body">
                    <h3 className="panel-title">
                      {e.title}
                      {e.category && <span className="sched-cat">{e.category}</span>}
                    </h3>
                    {e.location && <p className="muted panel-meta">{e.location}</p>}
                    {e.description && <p className="panel-desc">{e.description}</p>}
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

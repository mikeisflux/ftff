import { Link } from 'react-router-dom';
import FloorMap from '../components/FloorMap.jsx';

// Public floor plan (§9) — the interactive Wildwood Ballroom table map in
// view mode (live availability). Reserving a table happens in the exhibitor
// application; this page shows the layout and links there.
export default function FloorPlan() {
  return (
    <div className="section container">
      <h1 className="glow">Floor Plan</h1>
      <p className="muted">
        The Wildwood Ballroom exhibitor layout with live availability. To reserve a table,
        apply to become an exhibitor and pick your spot during the application.
      </p>

      <FloorMap selectable={false} />

      <div style={{ marginTop: 28, textAlign: 'center' }}>
        <Link to="/become-an-exhibitor" className="btn">Become an Exhibitor</Link>
      </div>
    </div>
  );
}

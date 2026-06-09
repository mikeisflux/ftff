import { useState } from 'react';

// Lightweight drag-to-reorder list (§13). Renders `items` and calls
// onReorder(orderedIds) after a drop. `render(item)` draws each row's content.
export default function Reorderable({ items, idKey = 'id', render, onReorder }) {
  const [dragId, setDragId] = useState(null);
  const [order, setOrder] = useState(null);
  const list = order || items;

  function onDrop(targetId) {
    if (!dragId || dragId === targetId) return;
    const ids = list.map((i) => i[idKey]);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    const next = [...list];
    next.splice(to, 0, next.splice(from, 1)[0]);
    setOrder(next);
    setDragId(null);
    onReorder(next.map((i) => i[idKey]));
  }

  return (
    <div>
      {list.map((item) => (
        <div
          key={item[idKey]}
          draggable
          onDragStart={() => setDragId(item[idKey])}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => onDrop(item[idKey])}
          className="card"
          style={{ marginBottom: 8, cursor: 'grab', opacity: dragId === item[idKey] ? 0.5 : 1 }}
        >
          <span className="muted" style={{ marginRight: 8 }}>⠿</span>
          {render(item)}
        </div>
      ))}
    </div>
  );
}

// Cell content for the "No. of Rooms" column on the booking list pages:
// the total ("2 Rooms") with the per-room-type breakdown beneath it
// ("1 × Deluxe Room", "1 × Twin Room"). Renders a muted "-" when the
// booking has no rooms recorded.
const RoomCountSummary = ({ total, lines = [] }) => {
  const count = Number(total) || 0;
  if (count <= 0) {
    return <span className="text-muted">-</span>;
  }
  return (
    <div style={{ lineHeight: 1.3 }}>
      <div className="fw-semibold text-dark">
        {count} {count === 1 ? "Room" : "Rooms"}
      </div>
      {(lines || []).map((line) => (
        <div
          key={line.roomType}
          className="text-muted"
          style={{ fontSize: "0.7rem" }}
        >
          {line.count} × {line.roomType}
        </div>
      ))}
    </div>
  );
};

// Groups booked rooms by room type, keeping the order each type first
// appears in. `getCount` defaults to 1 per entry (one entry per room); pass
// it when an entry carries its own quantity (e.g. a hotel line with 2 rooms).
export const countRoomTypes = (items, getType, getCount = () => 1) => {
  const counts = new Map();
  (items || []).forEach((item) => {
    if (!item) return;
    const type = String(getType(item) ?? "").trim();
    const count = Number(getCount(item)) || 0;
    if (!type || count <= 0) return;
    counts.set(type, (counts.get(type) || 0) + count);
  });
  return Array.from(counts, ([roomType, count]) => ({ roomType, count }));
};

export default RoomCountSummary;

/**
 * RoomFilters
 * --------------------------------------------------------------------------
 * Shared filter sidebar used by every booking room-list page. Visually and
 * behaviourally identical to the sidebar first built inline in RoomList.jsx
 * (Refund Policy + Room Type checkboxes + "Clear filters").
 *
 * Pass the object returned by the `useRoomFilters` hook as the `filters` prop.
 * Styling relies on the existing classes in styles/RoomList.css
 * (.room-filters-card, .filter-title, .filter-group, .filter-group-label),
 * so the page must already import that stylesheet (all room-list pages do).
 */
import React from "react";
import { Card, Form, Button } from "react-bootstrap";

export default function RoomFilters({ filters }) {
  if (!filters) return null;

  const {
    refundFilter,
    setRefundFilter,
    roomTypeOptions,
    selectedRoomTypes,
    toggleRoomType,
    clearFilters,
    hasActiveFilters,
  } = filters;

  return (
    <Card className="room-filters-card">
      <Card.Body className="p-3">
        <h6 className="filter-title mb-3">Filters</h6>

        {/* Refund Policy */}
        <div className="filter-group mb-3">
          <div className="filter-group-label">Refund Policy</div>
          <Form.Check
            type="checkbox"
            id="filter-refundable"
            label="Flexible"
            checked={refundFilter.refundable}
            onChange={(e) =>
              setRefundFilter((p) => ({ ...p, refundable: e.target.checked }))
            }
          />
          <Form.Check
            type="checkbox"
            id="filter-partial"
            label="Flexible - Partial"
            checked={refundFilter.partial === true}
            onChange={(e) =>
              setRefundFilter((p) => ({ ...p, partial: e.target.checked }))
            }
          />
          <Form.Check
            type="checkbox"
            id="filter-nonrefundable"
            label="Non Refundable"
            checked={refundFilter.nonRefundable}
            onChange={(e) =>
              setRefundFilter((p) => ({
                ...p,
                nonRefundable: e.target.checked,
              }))
            }
          />
        </div>

        {/* Room Type */}
        <div className="filter-group">
          <div className="filter-group-label">Room Type</div>
          {roomTypeOptions.length === 0 ? (
            <div className="text-muted small">No options</div>
          ) : (
            roomTypeOptions.map((rt) => (
              <Form.Check
                key={rt.roomtypeId ?? rt.code ?? rt.name}
                type="checkbox"
                id={`filter-rt-${rt.roomtypeId ?? rt.code ?? rt.name}`}
                label={rt.name}
                checked={selectedRoomTypes.includes(rt.name)}
                onChange={() => toggleRoomType(rt.name)}
              />
            ))
          )}
        </div>

        {hasActiveFilters && (
          <Button
            variant="link"
            size="sm"
            className="p-0 mt-2"
            onClick={clearFilters}
          >
            Clear filters
          </Button>
        )}
      </Card.Body>
    </Card>
  );
}

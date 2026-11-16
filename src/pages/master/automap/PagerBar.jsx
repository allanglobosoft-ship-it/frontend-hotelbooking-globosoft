import React from "react";
import { Button, Form } from "react-bootstrap";

/**
 * Compact server-side pager: "x–y of total", page-size select, prev/next.
 * `page` is 0-based, matching the backend PageResponse.
 */
export default function PagerBar({ page, size, totalElements, totalPages, onPageChange, onSizeChange, disabled }) {
  const total = Number(totalElements || 0);
  const from = total === 0 ? 0 : page * size + 1;
  const to = Math.min(total, (page + 1) * size);
  const last = Math.max(0, (totalPages || 1) - 1);

  return (
    <div className="ahm-pager d-flex flex-wrap align-items-center justify-content-between gap-2">
      <div className="text-muted small">
        {total === 0 ? "No records" : `Showing ${from.toLocaleString()}–${to.toLocaleString()} of ${total.toLocaleString()}`}
      </div>
      <div className="d-flex align-items-center gap-2">
        <Form.Select
          size="sm"
          aria-label="Rows per page"
          value={size}
          onChange={(e) => onSizeChange(Number(e.target.value))}
          disabled={disabled}
          style={{ width: "auto" }}
        >
          {[20, 50, 100].map((n) => (
            <option key={n} value={n}>
              {n} / page
            </option>
          ))}
        </Form.Select>
        <Button
          size="sm"
          variant="outline-secondary"
          onClick={() => onPageChange(Math.max(0, page - 1))}
          disabled={disabled || page <= 0}
          aria-label="Previous page"
        >
          <i className="fas fa-chevron-left" aria-hidden="true"></i>
        </Button>
        <span className="small text-muted">
          Page {total === 0 ? 0 : page + 1} of {total === 0 ? 0 : last + 1}
        </span>
        <Button
          size="sm"
          variant="outline-secondary"
          onClick={() => onPageChange(Math.min(last, page + 1))}
          disabled={disabled || page >= last}
          aria-label="Next page"
        >
          <i className="fas fa-chevron-right" aria-hidden="true"></i>
        </Button>
      </div>
    </div>
  );
}

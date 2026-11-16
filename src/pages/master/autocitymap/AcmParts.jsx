import React, { useEffect } from "react";
import { Button, Form } from "react-bootstrap";
import AsyncSelect from "react-select/async";
import axiosInstance from "../../../components/AxiosInstance";
import { PROVIDER_LABEL, REASONS, resultMeta } from "./acmShared";

/** Small coloured status label. */
export function StatusTag({ status }) {
  const m = resultMeta(status);
  return <span className={`acm-tag tone-${m.tone}`}>{m.label}</span>;
}

/** Column header that sorts the server-side list. */
export function SortTh({ label, field, sort, dir, onSort, className = "" }) {
  const activeSort = sort === field;
  const next = activeSort && dir === "desc" ? "asc" : "desc";
  return (
    <th className={`acm-th-sort ${activeSort ? "is-sorted" : ""} ${className}`}>
      <button type="button" onClick={() => onSort(field, activeSort ? next : "desc")} title={`Sort by ${label}`}>
        {label}
        <i className={`fas ms-1 ${activeSort ? (dir === "asc" ? "fa-sort-up" : "fa-sort-down") : "fa-sort"}`} aria-hidden="true"></i>
      </button>
    </th>
  );
}

/** "x–y of total", page size, previous / next. `page` is 0-based. */
export function Pager({ data, page, size, onPage, onSize, disabled }) {
  const total = Number(data?.totalElements || 0);
  const pages = Math.max(1, data?.totalPages || 1);
  // an action removed the last rows of the last page: step back to the last page that exists
  useEffect(() => {
    if (data && total > 0 && page > pages - 1) onPage(pages - 1);
  }, [data, total, page, pages, onPage]);
  const from = total === 0 ? 0 : page * size + 1;
  const to = Math.min(total, (page + 1) * size);
  return (
    <div className="acm-pager">
      <span className="acm-muted">{total === 0 ? "No records" : `${from.toLocaleString()}–${to.toLocaleString()} of ${total.toLocaleString()}`}</span>
      <div className="d-flex align-items-center gap-2">
        <Form.Select size="sm" className="acm-select acm-select-sm" value={size} disabled={disabled}
          onChange={(e) => onSize(Number(e.target.value))} aria-label="Rows per page">
          {[20, 50, 100].map((n) => (
            <option key={n} value={n}>{n} per page</option>
          ))}
        </Form.Select>
        <Button size="sm" variant="outline-secondary" disabled={disabled || page <= 0} onClick={() => onPage(page - 1)} aria-label="Previous page">
          <i className="fas fa-chevron-left" aria-hidden="true"></i>
        </Button>
        <span className="acm-muted small">{total === 0 ? "0 / 0" : `${page + 1} / ${pages}`}</span>
        <Button size="sm" variant="outline-secondary" disabled={disabled || page >= pages - 1} onClick={() => onPage(page + 1)} aria-label="Next page">
          <i className="fas fa-chevron-right" aria-hidden="true"></i>
        </Button>
      </div>
    </div>
  );
}

const loadCountries = async (input) => {
  try {
    const res = await axiosInstance.get("/api/country", { params: { search: input } });
    return (res.data || []).map((c) => ({ value: c.id, label: c.name }));
  } catch {
    return [];
  }
};

const selectStyles = {
  control: (base, state) => ({
    ...base,
    minHeight: 34,
    height: 34,
    borderRadius: 8,
    fontSize: "0.85rem",
    borderColor: state.isFocused ? "var(--mt-red, #EC0B43)" : "#d7dce2",
    boxShadow: state.isFocused ? "0 0 0 2px rgba(236, 11, 67, .14)" : "none",
    "&:hover": { borderColor: "#b9c0c8" },
  }),
  valueContainer: (base) => ({ ...base, padding: "0 8px" }),
  indicatorsContainer: (base) => ({ ...base, height: 32 }),
  menuPortal: (base) => ({ ...base, zIndex: 9999 }),
};

/** Country typeahead over /api/country (same source as the manual City Mapping screen). */
export function CountryPicker({ value, onChange }) {
  return (
    <div className="acm-country">
      <AsyncSelect
        cacheOptions
        defaultOptions
        isClearable
        placeholder="All countries"
        value={value}
        loadOptions={loadCountries}
        onChange={onChange}
        menuPortalTarget={document.body}
        styles={selectStyles}
        aria-label="Country"
      />
    </div>
  );
}

/**
 * Filter row shared by the lists. Only the controls a list needs are shown
 * (pass the matching props).
 */
export function FilterBar({
  q, onQ, placeholder = "Search city or supplier city…",
  provider, onProvider, providers,
  country, onCountry,
  reason, onReason,
  status, onStatus, statusOptions,
  children,
}) {
  return (
    <div className="acm-filters">
      <div className="acm-search">
        <i className="fas fa-search" aria-hidden="true"></i>
        <Form.Control size="sm" value={q} onChange={(e) => onQ(e.target.value)} placeholder={placeholder} aria-label="Search" />
      </div>
      {onProvider && (
        <Form.Select size="sm" className="acm-select" value={provider} onChange={(e) => onProvider(e.target.value)} aria-label="Supplier">
          <option value="">All suppliers</option>
          {(providers || Object.keys(PROVIDER_LABEL)).map((p) => (
            <option key={p} value={p}>{PROVIDER_LABEL[p] || p.toUpperCase()}</option>
          ))}
        </Form.Select>
      )}
      {onCountry && <CountryPicker value={country} onChange={onCountry} />}
      {onReason && (
        <Form.Select size="sm" className="acm-select acm-select-wide" value={reason} onChange={(e) => onReason(e.target.value)} aria-label="Reason">
          <option value="">Every reason</option>
          {REASONS.map(([code, text]) => (
            <option key={code} value={code}>{text}</option>
          ))}
        </Form.Select>
      )}
      {onStatus && (
        <Form.Select size="sm" className="acm-select" value={status} onChange={(e) => onStatus(e.target.value)} aria-label="Status">
          {statusOptions.map(([value, text]) => (
            <option key={value} value={value}>{text}</option>
          ))}
        </Form.Select>
      )}
      {children}
    </div>
  );
}

import React, { useCallback, useEffect, useState } from "react";
import { Alert, Button, Spinner } from "react-bootstrap";
import axiosInstance from "../../../components/AxiosInstance";
import { ACM_API, errorText, fmtDate, fmtNumber } from "./acmShared";

/**
 * Groups of RemainingClassifier (backend auto/match), in the order the server sends them.
 * kind: "map" and "tick" groups are ticked and shared row by row, "reject" groups are ticked and rejected,
 * "review" groups need the Review dialog.
 */
export const GROUP_META = {
  EXACT_NAME: {
    label: "Exact name, not taken yet", tone: "ok", kind: "map",
    text: "The only city of the country named exactly like the supplier city, which no city holds yet, and its state is certain (stated on both sides, or every supplier's list knows the name in one state only).",
  },
  SAME_PLACE: {
    label: "Same place listed twice", tone: "ok", kind: "map",
    text: "Differs from a mapped city only by a state suffix or spacing (\"Tampa, FL\" and \"Tampa\"), and every supplier's city list knows the name in that one state only. It can get the same supplier city.",
  },
  DIFFERENT_PLACE: {
    label: "Different place", tone: "bad", kind: "reject",
    text: "The supplier city is another city's own name (\"Mill Creek\" was offered Fort Mill). Tick the wrong ones and reject them: rejecting writes nothing, and Reopen undoes it.",
  },
  DISTRICT: {
    label: "District of a mapped city", tone: "warn", kind: "tick",
    text: "Named \"City-District\" (\"Paris-Villepinte\" for Paris). Usually an area of that city, but not always (\"Enugu-Ezike\" is its own town). Tick the right ones and share.",
  },
  RELATED_NAME: {
    label: "One name contains the other", tone: "warn", kind: "tick",
    text: "\"Venice Mestre\" / Mestre, \"Guatemala\" / Guatemala City, \"Pingxiang, Guangxi\" / Pingxiang: a district or a different town. Tick and share, or reject.",
  },
  SIMILAR_SPELLING: {
    label: "Almost the same spelling", tone: "warn", kind: "tick",
    text: "One or two letters apart, or the same letters spaced differently: \"Shenyeng\" / Shenyang is a typo, \"Machelen\" / Mechelen and \"St Ives\" / \"Saint Ives\" (England) are two towns. Tick and share, or reject.",
  },
  OTHER_STATE: {
    label: "Name used in several states", tone: "idle", kind: "review",
    text: "Cities with this name exist in more than one state (\"Lamar\": CO, MO, SC, TX) and the names here do not say which. Review each one.",
  },
  NEEDS_REVIEW: {
    label: "Needs a person", tone: "idle", kind: "review",
    text: "Nothing reliable to go by, or the engine found evidence against the pair (hotel positions far apart, codes disagree). Review each one.",
  },
};

/**
 * "Sort out what is left" on the Needs verification list: the rows a bulk approval could not write, put into
 * groups by GET /remaining/summary. Every group is opened as a list (RemainingList) to tick or review.
 */
export default function RemainingPanel({ reloadKey, selected, onSelect }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async (refresh = false) => {
    setLoading(true);
    try {
      const res = await axiosInstance.get(`${ACM_API}/remaining/summary`, { params: { refresh }, timeout: 120000 });
      setSummary(res.data || null);
      setError(null);
    } catch (err) {
      setError(errorText(err, "The remaining cities could not be grouped."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(false);
  }, [load, reloadKey]);

  const total = Number(summary?.total || 0);

  return (
    <section className="acm-remaining">
      <div className="acm-remaining-head">
        <div>
          <h6 className="mb-1">Sort out what is left</h6>
          <div className="acm-muted small">
            {summary
              ? `${fmtNumber(total)} cities wait for verification, grouped by what is wrong with their proposal (as of ${fmtDate(summary.takenAt)}).`
              : "Grouping the cities that wait for verification…"}
          </div>
        </div>
        <div className="acm-remaining-actions">
          <Button size="sm" variant="light" onClick={() => load(true)} disabled={loading} title="Group again" aria-label="Group again">
            {loading ? <Spinner animation="border" size="sm" /> : <i className="fas fa-sync-alt" aria-hidden="true"></i>}
          </Button>
        </div>
      </div>
      {error && <Alert variant="danger" className="small py-2 mb-2">{error}</Alert>}
      {summary && summary.statesComplete === false && (
        <Alert variant="warning" className="small py-2 mb-2">
          Some suppliers' city lists could not be read ({(summary.statesFailed || []).join("; ")}), so US, Canadian and Australian
          names without a state stay in review instead of being mapped.
        </Alert>
      )}
      {summary && total > 0 && (
        <div className="acm-remaining-groups">
          {summary.groups.filter((g) => g.count > 0).map((g) => {
            const meta = GROUP_META[g.group] || { label: g.group, tone: "idle", text: "" };
            const isOn = selected === g.group;
            return (
              <button type="button" key={g.group} className={`acm-group tone-${meta.tone} ${isOn ? "is-active" : ""}`}
                onClick={() => onSelect(isOn ? null : g.group)} title={meta.text} aria-pressed={isOn}>
                <span className="acm-group-count">{fmtNumber(g.count)}</span>
                <span className="acm-group-label">{meta.label}</span>
                <span className="acm-group-action">
                  {meta.kind === "reject" ? "Tick and reject" : meta.kind === "review" ? "Review each" : "Tick and confirm"}
                  {" · "}{isOn ? "Hide" : "Show"}
                </span>
              </button>
            );
          })}
        </div>
      )}
      {summary && total === 0 && <div className="acm-muted small">Nothing waits for verification.</div>}
    </section>
  );
}

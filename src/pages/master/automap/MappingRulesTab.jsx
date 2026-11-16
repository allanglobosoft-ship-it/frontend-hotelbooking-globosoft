import React, { useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button, Form, Spinner, Table } from "react-bootstrap";
import axiosInstance from "../../../components/AxiosInstance";
import { fmtDateTime, fmtNumber } from "./automapFormat";

const STEPS = [
  {
    title: "Collect",
    text: "Each supplier's hotel list is copied into our system and kept up to date.",
  },
  {
    title: "Find the city",
    text: "Each of our cities is linked to the same city at each supplier. Hotel search only asks a supplier about a city that has this link.",
  },
  {
    title: "Compare hotels",
    text: "Each hotel is compared with the other suppliers' hotels using its name, country, distance and city.",
  },
  {
    title: "Link automatically",
    text: "Identical name, same country, within the distance below (or same city when coordinates are missing), and sold by enough suppliers.",
  },
  {
    title: "Same phone, email or website",
    text: "Two suppliers' hotels with the same contact are compared, if no other hotel of either supplier uses it, because chains reuse contacts. The same country, within the distance below and sharing enough of the name makes an exact match. Any other pair goes to review, unless it is in another country or too far apart.",
  },
  {
    title: "Send to review",
    text: "A likely match that is not exact, such as a slightly different name, waits for an admin. Nothing here is linked without approval.",
  },
  {
    title: "Reject",
    text: "A different country, or too far apart, means a different hotel. It is not linked or offered for review.",
  },
  {
    title: "Use in search",
    text: "Linked hotels appear once in search at the cheapest rate. The room page then follows the Room Mapping setting above.",
  },
  {
    title: "Not mapped",
    text: "Anything still unlinked is listed on the Not Mapped tab, with the reason.",
  },
];

const CITY_STEPS = [
  {
    title: "Collect",
    text: "Each night, every supplier city that has hotels but no mapping is picked up.",
  },
  {
    title: "Look at the hotels",
    text: "Its hotels are compared with other suppliers' hotels already mapped: the same hotel linked across suppliers, and hotels within a kilometre.",
  },
  {
    title: "Look at the name",
    text: "The name is compared too, but only supports the hotels. A similar spelling alone never decides anything.",
  },
  {
    title: "Confident",
    text: "At least two signals agree on one of our cities, the states do not differ and it is not too far away. You can approve these as a whole group.",
  },
  {
    title: "Send to review",
    text: "If the signals disagree, or only one points at a city, an admin checks each one.",
  },
  {
    title: "Approve",
    text: "Nothing is mapped until an admin approves it. The usual checks still apply, and an existing mapping is never overwritten.",
  },
  {
    title: "Turn down",
    text: "A pair an admin turns down is remembered and not offered again.",
  },
  {
    title: "Watch for wrong mappings",
    text: "When two suppliers place one of our cities far apart, it is listed for checking and counts as evidence for nothing until then.",
  },
];

/** Read-only view of how mapping works and every setting in force, for admins to review. */
export default function MappingRulesTab({ active }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [roomMapping, setRoomMapping] = useState(null);
  const [roomMappingSaving, setRoomMappingSaving] = useState(false);
  const [roomMappingError, setRoomMappingError] = useState(null);

  const loadRoomMapping = useCallback(async () => {
    try {
      const res = await axiosInstance.get("/api/hotel-mapping/auto/room-mapping", { timeout: 30000 });
      setRoomMapping(res.data);
      setRoomMappingError(null);
    } catch (err) {
      setRoomMappingError(err?.response?.data?.error || "The Room Mapping setting could not be loaded.");
    }
  }, []);

  // The box follows what the server saved, so a failed save leaves it as it was.
  const saveRoomMapping = async (enabled) => {
    setRoomMappingSaving(true);
    try {
      const res = await axiosInstance.post("/api/hotel-mapping/auto/room-mapping", { enabled }, { timeout: 30000 });
      setRoomMapping(res.data);
      setRoomMappingError(null);
    } catch (err) {
      setRoomMappingError(err?.response?.data?.error || "The Room Mapping setting could not be saved.");
    } finally {
      setRoomMappingSaving(false);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axiosInstance.get("/api/hotel-mapping/auto/settings", { timeout: 30000 });
      setData(res.data);
      setError(null);
    } catch (err) {
      setError(err?.response?.data?.error || "The settings could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (active) {
      load();
      loadRoomMapping();
    }
  }, [active, load, loadRoomMapping]);

  const groups = [...new Set((data?.settings || []).map((s) => s.group))];

  return (
    <div className="d-flex flex-column gap-3">
      <div className="ahm-panel p-3">
        <h6 className="fw-bold">Room list of mapped hotels</h6>
        {roomMappingError && (
          <Alert variant="danger" className="py-2 small">
            {roomMappingError}
          </Alert>
        )}
        <Form.Check
          type="checkbox"
          id="room-mapping-enabled"
          label="Room Mapping"
          className="fw-semibold"
          checked={roomMapping?.enabled === true}
          disabled={!roomMapping || roomMappingSaving}
          onChange={(e) => saveRoomMapping(e.target.checked)}
        />
        <ul className="small text-muted mt-2 mb-2 ps-3">
          <li>
            <strong>Ticked:</strong> rooms whose names have the same words, in any order, are combined into one row, showing
            the cheapest rate.
          </li>
          <li>
            <strong>Unticked:</strong> every supplier's rooms are listed separately, with the supplier name for admins and
            staff.
          </li>
        </ul>
        <div className="small text-muted">
          Applies from the next room search, with no restart.
          {roomMapping?.updatedBy && (
            <>
              {" "}
              Last changed by {roomMapping.updatedBy} on {fmtDateTime(roomMapping.updatedAt)}.
            </>
          )}
        </div>
      </div>

      <div className="ahm-panel p-3">
        <h6 className="fw-bold">How a hotel gets mapped</h6>
        <ol className="mb-0 ps-3">
          {STEPS.map((s) => (
            <li key={s.title} className="mb-1">
              <strong>{s.title}.</strong> {s.text}
            </li>
          ))}
        </ol>
      </div>

      <div className="ahm-panel p-3">
        <h6 className="fw-bold">How a city gets mapped</h6>
        <ol className="mb-0 ps-3">
          {CITY_STEPS.map((s) => (
            <li key={s.title} className="mb-1">
              <strong>{s.title}.</strong> {s.text}
            </li>
          ))}
        </ol>
      </div>

      {error && (
        <Alert variant="danger" className="mb-0 d-flex justify-content-between align-items-center">
          <span>{error}</span>
          <Button size="sm" variant="outline-danger" onClick={load}>
            Retry
          </Button>
        </Alert>
      )}
      {loading && !data && (
        <div className="text-center py-4">
          <Spinner animation="border" size="sm" className="me-2" /> Loading settings…
        </div>
      )}

      {data && (
        <div className="ahm-panel">
          <div className="ahm-panel-head">
            <span>Suppliers in mapping</span>
          </div>
          <Table responsive hover className="ahm-table mb-0">
            <thead>
              <tr>
                <th>Supplier</th>
                <th>Status</th>
                <th className="text-end">Hotels</th>
                <th className="text-end">Mapped</th>
                <th className="text-end">Not mapped</th>
                <th className="text-end">Still to check</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {data.suppliers.map((s) => (
                <tr key={s.code}>
                  <td className="fw-semibold">{s.name}</td>
                  <td>
                    <Badge bg={s.enabled ? "success" : "secondary"}>{s.enabled ? "In mapping" : "Not in mapping"}</Badge>
                  </td>
                  <td className="text-end">{fmtNumber(s.catalogHotels)}</td>
                  <td className="text-end">{fmtNumber(s.mappedHotels)}</td>
                  <td className="text-end">{fmtNumber(s.notMappedHotels)}</td>
                  <td className="text-end">{fmtNumber(s.waitingHotels)}</td>
                  <td className="small text-muted">{s.note}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}

      {groups.map((group) => (
        <div className="ahm-panel" key={group}>
          <div className="ahm-panel-head">
            <span>{group}</span>
          </div>
          <Table responsive className="ahm-table mb-0">
            <thead>
              <tr>
                <th style={{ width: "32%" }}>Setting</th>
                <th style={{ width: "16%" }}>Current value</th>
                <th>What it means</th>
              </tr>
            </thead>
            <tbody>
              {data.settings
                .filter((s) => s.group === group)
                .map((s) => (
                  <tr key={s.label}>
                    <td>{s.label}</td>
                    <td className="fw-semibold">{s.value}</td>
                    <td className="small text-muted">{s.meaning}</td>
                  </tr>
                ))}
            </tbody>
          </Table>
        </div>
      ))}
      {data && (
        <p className="small text-muted mb-0">
          These values are set in the backend configuration, and changing one needs a restart. This screen shows what is in
          force so it can be reviewed.
        </p>
      )}
    </div>
  );
}

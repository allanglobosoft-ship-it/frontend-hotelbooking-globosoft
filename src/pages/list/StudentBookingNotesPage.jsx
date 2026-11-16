/**
 * StudentBookingNotesPage.jsx
 *
 * Notes page for a student booking — mirror of BookingNotesPage.jsx but
 * hitting the student notes endpoints:
 *   GET  /api/student-booking/:id/notes
 *   POST /api/student-booking/:id/notes  { noteText, createdBy }
 *
 * Reached from the NOTES button on the student booking detail view.
 */

import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Container, Form, Spinner } from "react-bootstrap";
import Sidebar from "../../components/Sidebar";
import TopBar from "../../components/TopBar";
import axiosInstance from "../../components/AxiosInstance";
import toast from "react-hot-toast";

const RED_BTN = {
  backgroundColor: "#c0392b",
  color: "#fff",
  border: "none",
  borderRadius: "3px",
  padding: "8px 18px",
  fontSize: "0.82rem",
  fontWeight: "600",
  cursor: "pointer",
};
const GREY_BTN = { ...RED_BTN, backgroundColor: "#666" };
const SECTION_HEADER = {
  backgroundColor: "#f0f0f0",
  padding: "8px 14px",
  fontWeight: "600",
  fontSize: "0.92rem",
  borderBottom: "1px solid #ddd",
};
const card = {
  border: "1px solid #ddd",
  borderRadius: "4px",
  marginBottom: "14px",
  backgroundColor: "#fff",
  overflow: "hidden",
};

const formatDateTime = (dateStr) => {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  return d.toLocaleString();
};

export default function StudentBookingNotesPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [noteText, setNoteText] = useState("");
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchNotes = useCallback(() => {
    setLoading(true);
    axiosInstance
      .get(`/api/student-booking/${id}/notes`)
      .then((res) => {
        if (res.data?.success) setNotes(res.data.notes || []);
        else toast.error(res.data?.message || "Failed to load notes");
      })
      .catch(() => toast.error("Error loading notes"))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (id) fetchNotes();
  }, [id, fetchNotes]);

  const handleSave = async () => {
    if (!noteText.trim()) {
      toast.error("Please enter some note text");
      return;
    }
    try {
      setSaving(true);
      const createdBy =
        sessionStorage.getItem("UserName") ||
        "unknown";
      const res = await axiosInstance.post(`/api/student-booking/${id}/notes`, {
        noteText: noteText.trim(),
        createdBy,
      });
      if (res.data?.success) {
        toast.success("Note saved");
        setNoteText("");
        fetchNotes();
      } else {
        toast.error(res.data?.message || "Failed to save note");
      }
    } catch (e) {
      toast.error(e.response?.data?.message || "Error saving note");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      <TopBar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="flex-grow-1 p-4" style={{ overflow: "auto" }}>
          <Container fluid style={{ maxWidth: "1000px" }}>
            <div className="mb-3 d-flex align-items-center" style={{ gap: "12px" }}>
              <button style={GREY_BTN} onClick={() => navigate(-1)}>
                ← Back
              </button>
              <h4 style={{ margin: 0, fontWeight: 700, color: "#333" }}>Booking Notes</h4>
              <span style={{ color: "#888", fontSize: "0.85rem" }}>Booking ID: {id}</span>
            </div>

            <div style={card}>
              <div style={SECTION_HEADER}>Add a Note</div>
              <div style={{ padding: "14px 16px" }}>
                <Form.Control
                  as="textarea"
                  rows={8}
                  placeholder="Type your note here. You can enter long paragraphs."
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  style={{ fontSize: "0.88rem", resize: "vertical" }}
                />
                <div style={{ marginTop: "12px", display: "flex", gap: "8px" }}>
                  <button style={RED_BTN} onClick={handleSave} disabled={saving}>
                    {saving ? "Saving..." : "SAVE"}
                  </button>
                  <button style={GREY_BTN} onClick={() => setNoteText("")} disabled={saving}>
                    CLEAR
                  </button>
                </div>
              </div>
            </div>

            <div style={card}>
              <div style={SECTION_HEADER}>
                Previous Notes {notes.length > 0 ? `(${notes.length})` : ""}
              </div>
              <div style={{ padding: "14px 16px" }}>
                {loading ? (
                  <div className="text-center py-3">
                    <Spinner animation="border" size="sm" style={{ color: "#c0392b" }} />
                  </div>
                ) : notes.length === 0 ? (
                  <div className="text-muted" style={{ fontSize: "0.85rem" }}>
                    No notes yet for this booking.
                  </div>
                ) : (
                  notes.map((n) => (
                    <div
                      key={n.noteId}
                      style={{
                        borderLeft: "3px solid #c0392b",
                        background: "#fafafa",
                        padding: "10px 12px",
                        marginBottom: "10px",
                        borderRadius: "3px",
                      }}
                    >
                      <div style={{ fontSize: "0.75rem", color: "#777", marginBottom: "4px" }}>
                        {n.createdBy ? `${n.createdBy} • ` : ""}
                        {formatDateTime(n.createdAt)}
                      </div>
                      <div style={{ fontSize: "0.88rem", whiteSpace: "pre-wrap", color: "#222" }}>
                        {n.noteText}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </Container>
        </main>
      </div>
    </div>
  );
}

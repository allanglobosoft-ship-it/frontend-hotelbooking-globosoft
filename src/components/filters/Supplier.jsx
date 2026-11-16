import React, { useEffect, useState } from "react";
import axiosInstance from "../AxiosInstance";
import { Form } from "react-bootstrap";
import chevronStyle from "./dropdownChevron";
import { isAgentLogin } from "../../utils/supplierDisplay";

export default function Supplier({ value, onChange }) {
  const [suppliers, setSuppliers] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  // Agents (and their sub-agents / sub-users) never see supplier names, so
  // the filter neither loads the supplier list nor renders for them.
  const hidden = isAgentLogin();

  useEffect(() => {
    if (hidden) return;
    axiosInstance
      .get("/api/external-apis/list")
      .then((res) => setSuppliers(res.data || []))
      .catch((err) => console.error("Failed to fetch suppliers:", err));
  }, [hidden]);

  const selectedOption = suppliers.find(
    (opt) => String(opt.id) === String(value)
  );

  const filteredSuppliers = searchTerm
    ? suppliers.filter((s) =>
        s.apiCode?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : suppliers;

  if (hidden) return null;

  return (
    <Form.Group>
      <Form.Label>Supplier</Form.Label>

      <div className="position-relative">
        <Form.Control
          size="sm"
          style={chevronStyle}
          value={isOpen ? searchTerm : selectedOption?.apiCode || ""}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder="Select supplier"
          autoComplete="off"
        />

        {isOpen && (
          <>
            {/* Dropdown */}
            <div
              className="position-absolute w-100 bg-white border shadow-lg"
              style={{
                zIndex: 1050,
                maxHeight: "200px",
                overflowY: "auto",
                top: "100%",
              }}
            >
              {filteredSuppliers.length > 0 ? (
                filteredSuppliers.map((opt) => (
                  <div
                    key={opt.id}
                    className="px-3 py-2"
                    style={{ cursor: "pointer" }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.backgroundColor = "#f8f9fa")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.backgroundColor = "white")
                    }
                    onClick={() => {
                      onChange(opt.id);
                      setIsOpen(false);
                      setSearchTerm("");
                    }}
                  >
                    {opt.apiCode}
                  </div>
                ))
              ) : (
                <div className="px-3 py-2 text-muted">
                  No suppliers found
                </div>
              )}
            </div>

            {/* Backdrop */}
            <div
              className="position-fixed"
              style={{
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 1040,
              }}
              onClick={() => {
                setIsOpen(false);
                setSearchTerm("");
              }}
            />
          </>
        )}
      </div>
    </Form.Group>
  );
}

/**
 * useRoomFilters
 * --------------------------------------------------------------------------
 * Shared Room-Type + Refund-Policy filter state for every booking room-list
 * page (the standard /room-list plus Student, Gov-Employee, Last-Minute,
 * Long-Stay and Day-Stay flows).
 *
 * It mirrors the exact behaviour first implemented inline in RoomList.jsx:
 *   - Refund Policy: "Flexible" / "Flexible - Partial" / "Non Refundable" checkboxes.
 *   - Room Type:     checkboxes built from GET /api/roomType (meal-plan style
 *                    names: "Room Only", "Room with BreakFast", ...).
 *
 * The predicate (`rateMatches`) is intentionally decoupled from the per-module
 * field names — each page's rate/room object stores refundability and meal
 * plan under different keys (rate.nonRefundable vs rate.refundable vs
 * room.refundable; rate.mealPlan vs rate.mealPlanName ...). Callers normalise
 * their object into `{ isNonRefundable, mealPlan }` before calling, so this
 * hook never has to know about any specific module's shape.
 *
 * Default (no filter selected) => rateMatches() returns true for everything,
 * so wiring this into a page can NEVER hide rooms unless the user opts in.
 */
import { useState, useEffect, useCallback } from "react";
import axiosInstance from "../components/AxiosInstance";
import {
  REFUND_FLEXIBLE,
  REFUND_NON_REFUNDABLE,
  refundFilterMatches,
} from "../utils/refundLabel";

export default function useRoomFilters() {
  const [refundFilter, setRefundFilter] = useState({
    refundable: false,
    partial: false,
    nonRefundable: false,
  });
  const [roomTypeOptions, setRoomTypeOptions] = useState([]);
  const [selectedRoomTypes, setSelectedRoomTypes] = useState([]);

  // Room-type options for the sidebar — same source/shape as /room-list.
  useEffect(() => {
    let cancelled = false;
    axiosInstance
      .get("/api/roomType?page=0&limit=10")
      .then((res) => {
        if (cancelled) return;
        const list = Array.isArray(res?.data)
          ? res.data
          : Array.isArray(res?.data?.content)
          ? res.data.content
          : [];
        setRoomTypeOptions(list);
      })
      .catch(() => {
        if (!cancelled) setRoomTypeOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleRoomType = useCallback((name) => {
    setSelectedRoomTypes((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name],
    );
  }, []);

  const clearFilters = useCallback(() => {
    setRefundFilter({ refundable: false, partial: false, nonRefundable: false });
    setSelectedRoomTypes([]);
  }, []);

  const hasActiveFilters =
    refundFilter.refundable ||
    refundFilter.partial ||
    refundFilter.nonRefundable ||
    selectedRoomTypes.length > 0;

  /**
   * Pure predicate — pass the normalised values from the current rate/room.
   * @param {Object} arg
   * @param {string}  [arg.label] the rate's refund label code (see utils/refundLabel)
   * @param {boolean} [arg.isNonRefundable] used when the page has no label: true if non-refundable
   * @param {string}  [arg.mealPlan] the meal-plan / room-type label to match
   * @returns {boolean} whether the rate passes the active filters
   */
  const rateMatches = useCallback(
    ({ label, isNonRefundable, mealPlan } = {}) => {
      // ── Refund Policy ──
      const code =
        label || (isNonRefundable === true ? REFUND_NON_REFUNDABLE : REFUND_FLEXIBLE);
      if (!refundFilterMatches(refundFilter, code)) {
        return false;
      }

      // ── Room Type (meal plan) ──
      if (selectedRoomTypes.length > 0) {
        const mp = String(mealPlan || "").toLowerCase();
        const hit = selectedRoomTypes.some(
          (name) => name && mp === String(name).toLowerCase(),
        );
        if (!hit) return false;
      }

      return true;
    },
    [refundFilter, selectedRoomTypes],
  );

  return {
    refundFilter,
    setRefundFilter,
    roomTypeOptions,
    selectedRoomTypes,
    toggleRoomType,
    clearFilters,
    hasActiveFilters,
    rateMatches,
  };
}

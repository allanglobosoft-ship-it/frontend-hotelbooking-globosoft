import { useEffect, useRef, useState } from "react";

/**
 * Refund flags for the hotels on a results page (see utils/refundPolicyFilter.js).
 *
 * Nothing is fetched until a Refund Policy box is ticked (`active`), so a page
 * that never uses the filter makes no extra calls and behaves as before. Each
 * key is looked up once; at most `limit` lookups run at a time. A failed lookup
 * is stored as null (unknown), which the strict filter hides.
 *
 * items — [{ key, fetchFlags: () => Promise<flags | null> }]. Put whatever the
 *         answer depends on (hotel, dates, contracts) in the key, so a new
 *         search with other dates is looked up again.
 *
 * Returns { flags: { [key]: flags | null }, loading }.
 */
export default function useRefundFlags(active, items, limit = 4) {
  const [flags, setFlags] = useState({});
  const [pending, setPending] = useState(0);
  const requested = useRef(new Set());

  useEffect(() => {
    if (!active) return;
    const todo = (items || []).filter(
      (it) => it?.key && !requested.current.has(it.key),
    );
    if (todo.length === 0) return;
    todo.forEach((it) => requested.current.add(it.key));
    setPending((n) => n + todo.length);

    let next = 0;
    const worker = async () => {
      while (next < todo.length) {
        const it = todo[next++];
        let result = null;
        try {
          result = await it.fetchFlags();
        } catch (_) {
          result = null;
        }
        setFlags((prev) => ({ ...prev, [it.key]: result ?? null }));
        setPending((n) => n - 1);
      }
    };
    for (let i = 0; i < Math.min(limit, todo.length); i++) worker();
  }, [active, items, limit]);

  return { flags, loading: pending > 0 };
}

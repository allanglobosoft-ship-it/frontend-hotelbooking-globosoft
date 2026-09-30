/**
 * Meal-plan → board category, so the Room Type filter on the API room list
 * can match what each supplier actually sends.
 *
 * The filter's checkboxes come from the inhouse master (/api/roomType):
 * "Room Only", "Room with BreakFast", "Room With Half Board",
 * "Room with FullBoard", "All Inclusive". The suppliers, however, label the
 * same plans as "Bed and Breakfast", "BB", "Continental Breakfast",
 * "Half-Board", "half-board", "nomeal", "Breakfast, Lunch, Dinner", "AI",
 * "Ultra All-Inclusive" … so an exact name comparison never matched and
 * ticking any Room Type hid every rate. Both sides are reduced to one of
 * five categories and compared on that.
 *
 * Returns "RO" | "BB" | "HB" | "FB" | "AI", or null when the text carries no
 * recognisable board information (e.g. Jumeirah's "Meal Included").
 */
export const mealPlanCategory = (text) => {
  const t = String(text || "")
    .trim()
    .toLowerCase();
  if (!t) return null;
  const has = (re) => re.test(t);

  // Order matters: the richer plans mention the cheaper ones' keywords too
  // ("Ultra All-Inclusive", "Breakfast, Lunch, Dinner"), so test them first.
  // "Modified American Plan" (= half board) contains "American Plan"
  // (= full board), so it is settled before the FB test.
  if (has(/modified american|\bmap\b/)) return "HB";
  if (has(/all[\s-]*inclusive|\bu?ai\b|\bais\b|\bsai\b|\brapi\b/)) return "AI";
  if (
    has(
      /full[\s-]*board|\bfb\b|\brwfb\b|american plan|\bap\b|three meals|(breakfast|lunch|dinner)[^a-z]*(breakfast|lunch|dinner)[^a-z]*(breakfast|lunch|dinner)/,
    )
  )
    return "FB";
  if (
    has(
      /half[\s-]*board|\bhb\b|\brwhb\b|\bbd\b|dinner|(breakfast|lunch)[^a-z]*(breakfast|lunch)/,
    )
  )
    return "HB";
  if (has(/breakfast|\bbb\d?\b|\bb&b\b|\bbf\b|\bcb\b|\brwbf\b/)) return "BB";
  if (
    has(
      /room[\s-]*only|no[\s-]*meals?|\bro\b|\bep\b|european plan|accommodation only|self[\s-]*catering|without meals?/,
    )
  )
    return "RO";
  return null;
};

/**
 * Resolve the master Room Type NAME a supplier rate should be filtered
 * under. Returns the matching option's name when the rate's meal plan (or
 * code) maps to the same category as one of the options; otherwise the raw
 * meal plan text, so an exact name match still works and unknown plans keep
 * today's behaviour.
 */
export const roomTypeNameForRate = (rate, roomTypeOptions) => {
  const raw = rate?.mealPlan;
  const cat = mealPlanCategory(raw) || mealPlanCategory(rate?.mealPlanCode);
  if (cat && Array.isArray(roomTypeOptions)) {
    const option = roomTypeOptions.find(
      (rt) =>
        mealPlanCategory(rt?.name) === cat || mealPlanCategory(rt?.code) === cat,
    );
    if (option?.name) return option.name;
  }
  return raw;
};

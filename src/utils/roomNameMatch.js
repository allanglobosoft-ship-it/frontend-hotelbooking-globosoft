/**
 * Room names for hotels mapped across several suppliers: the name to show, and
 * when two names mean the same room (the Room Mapping setting).
 */

// The backend shortens these suppliers' room names in `roomCategory` ("Club Room"
// for "Club Room, 1 King Bed, Sea View") and keeps the full name in `baseRoomType`.
// For other suppliers `baseRoomType` can be an id or a code (Darina, Jumeirah),
// and `roomCategory` already is the full name.
const SHORTENED_NAME_SUPPLIERS = ["IWTX", "X3"];

/** The supplier's full name for a room type of /api/hotel-rooms/search. */
export function fullRoomName(category) {
  const supplier = String(category?.apiType || "").trim().toUpperCase();
  const name = SHORTENED_NAME_SUPPLIERS.includes(supplier)
    ? category?.baseRoomType || category?.roomCategory
    : category?.roomCategory;
  return name || "";
}

/**
 * A supplier's name without its repeats: Atharva's leading "1 X " and the bed
 * text IWTX and X3 repeat at the end ("Deluxe Room, 1 King Bed 1 King Bed").
 */
export function cleanRoomName(name) {
  const text = String(name ?? "")
    .replace(/\s+/g, " ")
    .replace(/^\s*1\s*x\s+/i, "")
    .trim();
  const words = text.split(" ");
  for (let size = Math.min(4, words.length - 1); size >= 2; size--) {
    const before = words.slice(0, -size).join(" ");
    const tail = words.slice(-size).join(" ");
    if (` ${before} `.toLowerCase().replace(/[(),]/g, " ").includes(` ${tail.toLowerCase()} `)) {
      return before.replace(/[\s,]+$/, "");
    }
  }
  return text;
}

const FILLER_WORDS = new Set(["room", "rooms", "bed", "beds", "with", "and", "or", "the", "a", "of"]);

// How many of a bed a name means when it gives no number: "King" is one king
// bed, "Twin" is two twin beds. Any other number is a different room, so
// "1 Twin Bed" stays apart from "2 Twin Beds".
const USUAL_BED_COUNT = { king: "1", queen: "1", double: "1", twin: "2" };

/**
 * Two rooms are the same when this is equal: the same words in any order,
 * ignoring capitals, punctuation and filler words. Empty when a name has no
 * meaningful words, which can't be matched.
 */
export function roomMatchKey(name) {
  const words = cleanRoomName(name)
    .toLowerCase()
    .replace(/(\d+)\s*-?\s*bed\s*rooms?/g, "$1bedroom")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/(\d+) (king|queen|double|twin)(?= |$)/g, (_, count, bed) =>
      count === USUAL_BED_COUNT[bed] ? bed : `${count}${bed}`,
    )
    .split(" ")
    .filter((word) => word && !FILLER_WORDS.has(word));
  return [...new Set(words)].sort().join(" ");
}

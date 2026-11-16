/**
 * The message the server sent for a failed request, or `fallback`.
 *
 * Master / mapping / hotel endpoints answer 409 with a sentence the user
 * can act on ("Cannot delete room category 'Deluxe': it is used by 12
 * hotel room categories…", "Market type 'GCC' already exists") and 400 for
 * validation. The pages used to replace that with a fixed "Sorry!! not
 * deleted" text. Handles both the JSON ErrorResponse ({ message }) and the
 * plain-string bodies some endpoints return; ignores HTML error pages.
 */
export const apiErrorMessage = (error, fallback) => {
  const data = error?.response?.data;
  if (typeof data === "string") {
    const text = data.trim();
    if (text && !text.startsWith("<") && text.length <= 500) return text;
  } else if (data && typeof data.message === "string" && data.message.trim()) {
    return data.message.trim();
  }
  return fallback;
};

export default apiErrorMessage;

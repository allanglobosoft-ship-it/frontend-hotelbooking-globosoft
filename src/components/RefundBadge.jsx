import React from "react";
import { Badge } from "react-bootstrap";
import {
  labelOfRate,
  refundLabelBadge,
  refundLabelText,
} from "../utils/refundLabel";

/**
 * The refund label as a badge, the same on every screen. Pass the rate, or a
 * label code directly when the screen already has one.
 */
const RefundBadge = ({ rate, label, className = "" }) => {
  const code = label || labelOfRate(rate);
  const variant = refundLabelBadge(code);
  return (
    <Badge
      bg={variant}
      text={variant === "warning" ? "dark" : undefined}
      className={className}
    >
      {refundLabelText(code)}
    </Badge>
  );
};

export default RefundBadge;

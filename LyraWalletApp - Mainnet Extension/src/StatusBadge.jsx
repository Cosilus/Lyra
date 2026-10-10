import { CircleCheck, CircleDashed, CircleX, Clock5, ScanSearch, TriangleAlert, TrendingUp, TrendingDown } from "lucide-react";
import "./status-badge.css";

// The wallet's status badges: soft tinted background, colored semibold
// label, a bold icon in front. One look for every status in the wallet
// (requests, audit trail, balance change, "Required", "Soon").
const ICONS = {
  success: CircleCheck,
  failed: CircleX,
  pending: TriangleAlert,
  progress: CircleDashed,
  review: ScanSearch,
  expired: Clock5,
  submitted: Clock5,
  up: TrendingUp,
  down: TrendingDown,
};

export function StatusBadge({ status = "expired", icon, children, className = "", title }) {
  const Icon = icon || ICONS[status] || Clock5;
  return (
    <span className={`status-badge is-${status}${className ? ` ${className}` : ""}`} title={title}>
      <Icon className="status-badge-icon" strokeWidth={3} aria-hidden="true" />
      <span>{children}</span>
    </span>
  );
}

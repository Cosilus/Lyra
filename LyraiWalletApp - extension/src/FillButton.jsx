import "./fill-button.css";

// A button whose icon sits next to its label. On hover (or while pressed) a
// pearl circle grows from the icon to fill the whole button, and the colors
// swap: white icon at rest, violet icon and dark label on hover.
// iconSide="left" puts the icon before the words (Confirm with biometrics),
// so the fill grows from the left.
export function FillButton({ icon: Icon, iconSide = "right", iconSpin = false, className = "", children, ...props }) {
  const circle = Icon && (
    <span className="fill-btn-icon" aria-hidden="true">
      <span className="fill-btn-fill" />
      <span className="fill-btn-glyphs">
        <Icon className={iconSpin ? "spin" : undefined} size={14} strokeWidth={2.2} />
      </span>
    </span>
  );
  return (
    <button type="button" {...props} className={`fill-btn fill-btn--${iconSide} ${className}`}>
      <span className="fill-btn-row">
        {iconSide === "left" && circle}
        <span className="fill-btn-label">{children}</span>
        {iconSide !== "left" && circle}
      </span>
    </button>
  );
}

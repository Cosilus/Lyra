// "switch to 3D" / "passe en 2D" etc.: handled locally, same switch as
// Settings -> Interface, no AI round trip. Short messages only so a real
// request that merely mentions 3D isn't hijacked.
export function parseUiModeCommand(text) {
  const t = text.trim().toLowerCase();
  if (t.length > 60) return null;
  const m = t.match(/\b(2|3)\s?-?d\b/);
  if (!m) return null;
  if (!/\b(switch|change|go|set|turn|use|enable|activate|put|back|passe|passer|mets|mettre|active|activer|bascule|basculer|retour|revenir|remets)\b/.test(t)) return null;
  return m[1] === "3" ? "3d" : "2d";
}

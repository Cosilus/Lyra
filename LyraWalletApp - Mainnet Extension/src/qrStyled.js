import QRCode from "qrcode";

// "Liquid" QR: pearl-white rounded tile, data modules melted into smooth
// blobs (round outer corners, filled inner corners, lone modules are
// dots), rounded ring-shaped corner eyes, and the Lyra sparkle in a
// badge at the centre. It is still the real matrix: error correction H
// absorbs the ~6% knocked out for the badge.
const QR_LOGO_PATH = "M 197.386719 112.5 L 198.328125 161.070312 C 198.464844 167.78125 201.101562 174.179688 205.683594 178.925781 C 210.289062 183.671875 216.476562 186.398438 222.984375 186.53125 L 270.011719 187.5 L 222.984375 188.472656 C 216.476562 188.605469 210.289062 191.332031 205.683594 196.078125 C 201.101562 200.824219 198.464844 207.222656 198.328125 213.933594 L 197.386719 262.503906 L 196.449219 213.933594 C 196.3125 207.222656 193.675781 200.824219 189.070312 196.078125 C 184.484375 191.332031 178.296875 188.605469 171.789062 188.472656 L 124.765625 187.5 L 171.789062 186.53125 C 178.296875 186.398438 184.484375 183.671875 189.070312 178.925781 C 193.675781 174.179688 196.3125 167.78125 196.449219 161.070312 Z";

export function qrStyledDataUrl(text) {
  const qr = QRCode.create(text, { errorCorrectionLevel: "H" });
  const n = qr.modules.size;
  const quiet = 3;
  const total = n + quiet * 2;
  const R = 0.5;
  const TILE = "#FBF8FF";

  // Centre knock-out for the logo badge (odd number of modules).
  const logoSide = Math.max(7, 2 * Math.round(n * 0.24 / 2) + 1);
  const logoFrom = Math.floor((n - logoSide) / 2);
  const logoTo = logoFrom + logoSide - 1;
  const inLogo = (r, c) => r >= logoFrom && r <= logoTo && c >= logoFrom && c <= logoTo;
  const inEye = (r, c) => (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);

  const dark = (r, c) => r >= 0 && c >= 0 && r < n && c < n && qr.modules.get(r, c) && !inLogo(r, c) && !inEye(r, c);

  const f = (v) => +v.toFixed(3);
  let d = "";
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!dark(r, c)) continue;
      const up = dark(r - 1, c), dn = dark(r + 1, c), lf = dark(r, c - 1), rt = dark(r, c + 1);
      const tl = !up && !lf ? R : 0, tr = !up && !rt ? R : 0, br = !dn && !rt ? R : 0, bl = !dn && !lf ? R : 0;
      const x0 = c + quiet, y0 = r + quiet, x1 = x0 + 1, y1 = y0 + 1;
      d += `M${f(x0 + tl)} ${y0}H${f(x1 - tr)}`;
      if (tr) d += `A${tr} ${tr} 0 0 1 ${x1} ${f(y0 + tr)}`;
      d += `V${f(y1 - br)}`;
      if (br) d += `A${br} ${br} 0 0 1 ${f(x1 - br)} ${y1}`;
      d += `H${f(x0 + bl)}`;
      if (bl) d += `A${bl} ${bl} 0 0 1 ${x0} ${f(y1 - bl)}`;
      d += `V${f(y0 + tl)}`;
      if (tl) d += `A${tl} ${tl} 0 0 1 ${f(x0 + tl)} ${y0}`;
      d += "Z";
      // Inner corners: two dark neighbours meeting at a light diagonal get a
      // concave fillet so blobs flow instead of pinching.
      const corners = [
        [up && lf && !dark(r - 1, c - 1), x0, y0, -1, -1],
        [up && rt && !dark(r - 1, c + 1), x1, y0, 1, -1],
        [dn && rt && !dark(r + 1, c + 1), x1, y1, 1, 1],
        [dn && lf && !dark(r + 1, c - 1), x0, y1, -1, 1],
      ];
      for (const [on, px, py, dx, dy] of corners) {
        if (!on) continue;
        d += `M${px} ${py}L${f(px + dx * R)} ${py}A${R} ${R} 0 0 ${dx * dy > 0 ? 0 : 1} ${px} ${f(py + dy * R)}Z`;
      }
    }
  }

  // Corner eyes: ring + centre dot, rounded.
  const eye = (r0, c0) => {
    const x = c0 + quiet, y = r0 + quiet;
    return `<rect x="${x}" y="${y}" width="7" height="7" rx="2" fill="url(#qg)"/>` +
      `<rect x="${x + 1}" y="${y + 1}" width="5" height="5" rx="1.35" fill="${TILE}"/>` +
      `<rect x="${x + 2}" y="${y + 2}" width="3" height="3" rx="1" fill="url(#qg)"/>`;
  };

  // Logo badge: pearl ring (knock-out) around a dark rounded badge with the sparkle.
  const mid = total / 2;
  const ring = logoSide;
  const badge = logoSide - 1.6;
  const logoScale = (badge * 0.92) / 100;
  const badgeSvg =
    `<rect x="${f(mid - ring / 2)}" y="${f(mid - ring / 2)}" width="${ring}" height="${ring}" rx="${f(ring * 0.3)}" fill="${TILE}"/>` +
    `<rect x="${f(mid - badge / 2)}" y="${f(mid - badge / 2)}" width="${f(badge)}" height="${f(badge)}" rx="${f(badge * 0.28)}" fill="url(#qg)"/>` +
    `<g transform="translate(${f(mid - badge * 0.46)} ${f(mid - badge * 0.46)}) scale(${f(logoScale)})">` +
    `<g transform="translate(7.88 6.5) scale(0.58) translate(-124.765625 -112.5)"><path fill="#fff" d="${QR_LOGO_PATH}"/></g></g>`;

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="240" height="240" shape-rendering="geometricPrecision">` +
    `<defs><linearGradient id="qg" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${total}" y2="${total}"><stop offset="0" stop-color="#3B2A66"/><stop offset="1" stop-color="#150E20"/></linearGradient></defs>` +
    `<rect width="${total}" height="${total}" rx="${f(total * 0.09)}" fill="${TILE}"/>` +
    `<path d="${d}" fill="url(#qg)"/>` +
    eye(0, 0) + eye(0, n - 7) + eye(n - 7, 0) +
    badgeSvg +
    `</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

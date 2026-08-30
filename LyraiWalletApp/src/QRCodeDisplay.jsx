import React, { useState } from "react";
import { Check, Download } from "lucide-react";

export function QRCodeDisplay({ data, isLoading, error }) {
  const [downloading, setDownloading] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [localError, setLocalError] = useState(null);

  async function handleDownload() {
    if (!data?.output) return;
    setDownloading(true);
    setLocalError(null);
    try {
      const response = await fetch(data.output);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "lyra-receive-qrcode.png";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setDownloaded(true);
      setTimeout(() => setDownloaded(false), 1200);
    } catch (e) {
      console.error("Failed to download QR code:", e);
      setLocalError("Failed to download. Please try again.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="ticket qr-ticket">
      <div className="ticket-title">Receive · QR Code</div>

      {isLoading && (
        <div className="qr-body">
          <div className="qr-skeleton" />
          <div className="qr-skeleton-line" />
        </div>
      )}

      {!isLoading && (error || localError) && (
        <div className="warning">{error || localError}</div>
      )}

      {!isLoading && !error && !localError && data && (
        <div className="qr-body">
          <div className="qr-frame">
            <img
              src={data.output}
              alt={`QR code for ${data.data}`}
              width={data.size}
              height={data.size}
              loading="lazy"
              decoding="async"
              className="qr-image"
            />
          </div>

          <div className="qr-address" title={data.data}>{data.data}</div>
        </div>
      )}
    </div>
  );
}

export default QRCodeDisplay;
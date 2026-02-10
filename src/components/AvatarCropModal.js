"use client";

import { useCallback, useMemo, useState } from "react";
import Cropper from "react-easy-crop";

function createImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", (e) => reject(e));
    image.setAttribute("crossOrigin", "anonymous");
    image.src = url;
  });
}

async function getCroppedBlob(imageSrc, cropPixels, size = 256) {
  const image = await createImage(imageSrc);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  canvas.width = size;
  canvas.height = size;

  // מרכז cropPixels -> לתוך canvas בגודל size
  ctx.drawImage(
    image,
    cropPixels.x,
    cropPixels.y,
    cropPixels.width,
    cropPixels.height,
    0,
    0,
    size,
    size
  );

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.9);
  });
}

export default function AvatarCropModal({
  file,
  open,
  onClose,
  onSave,
  outputSize = 256,
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [saving, setSaving] = useState(false);

  const imageUrl = useMemo(() => {
    if (!file) return null;
    return URL.createObjectURL(file);
  }, [file]);

  const onCropComplete = useCallback((_croppedArea, croppedPixels) => {
    setCroppedAreaPixels(croppedPixels);
  }, []);

  async function handleSave() {
    if (!imageUrl || !croppedAreaPixels) return;
    setSaving(true);
    try {
      const blob = await getCroppedBlob(imageUrl, croppedAreaPixels, outputSize);
      onSave(blob); // נחזיר blob מוכן להעלאה
    } finally {
      setSaving(false);
    }
  }

  if (!open || !file) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        display: "grid",
        placeItems: "center",
        zIndex: 9999,
        padding: 16,
      }}
    >
      <div
        style={{
          width: "min(520px, 100%)",
          background: "white",
          borderRadius: 12,
          padding: 12,
          border: "1px solid #ddd",
        }}
      >
        <h3 style={{ marginTop: 0, marginBottom: 10 }}>Crop avatar</h3>

        <div
          style={{
            position: "relative",
            width: "100%",
            height: 360,
            background: "#111",
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          <Cropper
            image={imageUrl}
            crop={crop}
            zoom={zoom}
            aspect={1}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>

        <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
          <label style={{ display: "grid", gap: 6 }}>
            Zoom
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
            />
          </label>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              style={{
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid #ddd",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              style={{
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid #ddd",
                cursor: "pointer",
              }}
            >
              {saving ? "Preparing..." : "Use this"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
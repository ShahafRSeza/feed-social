"use client";

import { useEffect } from "react";

export default function ImageModal({ src, alt, onClose }) {
  useEffect(() => {
    function handleKey(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  if (!src) return null;

  return (
    <div className="imageModalOverlay" onClick={onClose}>
      <img
        src={src}
        alt={alt || ""}
        className="imageModalContent"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

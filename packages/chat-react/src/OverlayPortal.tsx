"use client";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";

/** Renders children on document.body so overlays escape overflow-clipped app shells. */
export function OverlayPortal({ children }: { children: ReactNode }) {
  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
}

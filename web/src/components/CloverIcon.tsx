// src/components/CloverIcon.tsx
import * as React from "react";

/**
 * Calming, brandable 3-leaf clover icon for Brigid.
 * - Uses currentColor so you can tint via Tailwind (e.g., text-violet-600)
 * - Works in Server Components; no client hooks
 */
export function CloverIcon({
  className = "h-5 w-5 text-violet-600",
  title = "Brigid clover",
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label={title}
    >
      {/* Leaves */}
      <g fill="currentColor">
        <circle cx="32" cy="18" r="11" />
        <circle cx="20" cy="34" r="11" />
        <circle cx="44" cy="34" r="11" />
      </g>
      {/* Stem */}
      <path
        d="M32 36 C30 46, 28 52, 23 58"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

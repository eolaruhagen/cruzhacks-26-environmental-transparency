import * as React from "react"

export function EcoGlassMark(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 32 32" shapeRendering="crispEdges" {...props}>
      <rect x="2.5" y="2.5" width="27" height="27" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <rect x="9" y="9" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <rect x="13" y="13" width="6" height="6" fill="var(--color-accent)" />
    </svg>
  )
}

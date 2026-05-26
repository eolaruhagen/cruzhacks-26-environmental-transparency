// Numbered badge — wf-step-number owns chrome; this picks the box + text size.
import * as React from "react"
import { cn } from "@/lib/utils"

type StepSize = "sm" | "md" | "lg"
type StepTone = "default" | "dark"

const SIZE_CLASS: Record<StepSize, string> = {
  sm: "w-10 h-10",
  md: "w-12 h-12 text-lg",
  lg: "w-12 h-12 text-xl",
}

// Text color sets the border color too — wf-step-number leaves the border
// at `currentColor` so we don't have to mirror every accent shade.
const TONE_CLASS: Record<StepTone, string> = {
  default: "text-accent",
  dark: "text-accent-dark",
}

type Props = {
  size?: StepSize
  tone?: StepTone
  className?: string
  children: React.ReactNode
}

export function StepNumber({ size = "md", tone = "default", className, children }: Props) {
  return (
    <div className={cn("wf-step-number", SIZE_CLASS[size], TONE_CLASS[tone], className)}>
      {children}
    </div>
  )
}

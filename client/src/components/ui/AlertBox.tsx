// Colored callout container — caller controls inner text color.
import * as React from "react"
import { cn } from "@/lib/utils"

export type AlertVariant = "warning" | "caution" | "info" | "good"

const VARIANT_CLASS: Record<AlertVariant, string> = {
  warning: "wf-alert-warning",
  caution: "wf-alert-caution",
  info: "wf-alert-info",
  good: "wf-alert-good",
}

type Props = {
  variant: AlertVariant
  className?: string
  children: React.ReactNode
}

export function AlertBox({ variant, className, children }: Props) {
  return <div className={cn(VARIANT_CLASS[variant], className)}>{children}</div>
}

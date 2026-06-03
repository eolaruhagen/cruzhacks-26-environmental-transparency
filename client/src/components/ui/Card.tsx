// Polymorphic container wrapper around the wf-* card/section variants.
import * as React from "react"
import { cn } from "@/lib/utils"

export type CardVariant = "default" | "section" | "glass" | "glass-card"

const VARIANT_CLASS: Record<CardVariant, string> = {
  default: "wf-card",
  section: "wf-section",
  glass: "wf-glass",
  "glass-card": "wf-glass-card",
}

type CardProps<T extends React.ElementType = "div"> = {
  variant?: CardVariant
  as?: T
  className?: string
  children?: React.ReactNode
} & Omit<React.ComponentPropsWithoutRef<T>, "as" | "className" | "children">

export function Card<T extends React.ElementType = "div">({
  variant = "default",
  as,
  className,
  ...rest
}: CardProps<T>) {
  const Tag = (as ?? "div") as React.ElementType
  return <Tag className={cn(VARIANT_CLASS[variant], className)} {...rest} />
}

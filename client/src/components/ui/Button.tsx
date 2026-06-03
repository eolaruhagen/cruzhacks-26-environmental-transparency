// Polymorphic wrapper around the wf-btn* variants. Defaults type="button" when rendered as <button>.
import * as React from "react"
import { cn } from "@/lib/utils"

export type ButtonVariant = "default" | "active" | "active-transparent"

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  default: "wf-btn",
  active: "wf-btn-active",
  "active-transparent": "wf-btn-active-transparent",
}

type ButtonProps<T extends React.ElementType = "button"> = {
  variant?: ButtonVariant
  as?: T
  className?: string
  children?: React.ReactNode
} & Omit<React.ComponentPropsWithoutRef<T>, "as" | "className" | "children">

export function Button<T extends React.ElementType = "button">({
  variant = "default",
  as,
  className,
  ...rest
}: ButtonProps<T>) {
  const Tag = (as ?? "button") as React.ElementType
  const typeProp =
    (!as || as === "button") && (rest as { type?: string }).type === undefined
      ? { type: "button" as const }
      : {}
  return <Tag className={cn(VARIANT_CLASS[variant], className)} {...typeProp} {...rest} />
}

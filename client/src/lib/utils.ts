import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import type { BillType } from "./types"


export function formatBillCategory(category: BillType | null) {
  if (!category) return 'Unknown Category'
  // capitalize each word
  return category.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}

/**
 * - Compares passed date to current date, if time difference is ~ 1 week, returns "N days ago"
 * - If time difference is < 1 month, returns "N weeks ago"
 * - If less than one day returns "Today"
 * - If more than one month, returns "Month Day, Year"
 * @param date - ISO compatible string (such as a pg timestampz)
 * @returns viewable date string
 */
export function formatTzDate(date: string | null): string | null {
  if (!date) return null
  const passedDate = new Date(date)
  if (isNaN(passedDate.getTime())) {
    return null
  }
  const currDate = new Date()

  if (passedDate.getTime() > currDate.getTime()) {
    return null
  }

  const diffMs = currDate.getTime() - passedDate.getTime()
  const diffDays = diffMs / (1000 * 60 * 60 * 24)
  const diffWeeks = diffDays / 7
  const diffIMonths = diffDays / 30

  if (diffDays < 1) {
    return "Today"
  } else if (diffWeeks < 1) {
    return `${Math.floor(diffDays)} days ago`
  } else if (diffIMonths < 1) {
    return `${Math.floor(diffWeeks)} weeks ago`
  } else {
    return passedDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  }
}


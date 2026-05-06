import { describe, test } from "node:test"
import assert from "node:assert"
import { formatTzDate } from "../utils"

describe("formatTzDate", () => {
    test("should return 'Today' for dates within the last 24 hours", () => {
        const date = new Date()
        assert.strictEqual(formatTzDate(date.toISOString()), "Today")
    })

    test("should return 'N days ago' for dates within the last week", () => {
        const date = new Date()
        date.setDate(date.getDate() - 3)
        assert.strictEqual(formatTzDate(date.toISOString()), "3 days ago")
    })

    test("should return 'N weeks ago' for dates within the last month", () => {
        const date = new Date()
        date.setDate(date.getDate() - 14)
        assert.strictEqual(formatTzDate(date.toISOString()), "2 weeks ago")
    })

    test("should return 'Month Day, Year' for dates older than a month", () => {
        const date = new Date()
        date.setDate(date.getDate() - 30)
        assert.strictEqual(formatTzDate(date.toISOString()), date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }))
    })

    test("More than one month ago should give the actual date", () => {
        const date = new Date()
        date.setDate(date.getDate() - 60)
        assert.strictEqual(formatTzDate(date.toISOString()), date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }))
    })
})
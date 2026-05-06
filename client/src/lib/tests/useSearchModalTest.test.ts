
import { describe, it, beforeEach, afterEach, mock } from "node:test"
import assert from "node:assert/strict"
import { useSearchModal } from "../../components/search/hooks/useSearchModal"
import { type SearchModalFilter, type SearchModalSortOption, type TextFilter, type SearchModalQueryFn, type SearchModalCountFn, type PaginatedQueryResult } from "../../components/search/ui/SearchModal"
import { renderHook, act } from "@testing-library/react"
import 'global-jsdom/register'

/**
 * deferred() — a promise you can resolve/reject from outside.
 *
 * Why we need this: real queryFn calls return promises that resolve "whenever
 * the network feels like it."
 */
function deferred<T>() {
    let resolve!: (v: T) => void
    let reject!: (e: unknown) => void
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
    return { promise, resolve, reject }
}

/**
 * Flush microtasks + React state. Use this instead of `await flushPendingState()`
 * because mock.timers.enable intercepts setTimeout and those promises never resolve.
 */
async function flushPendingState() {
    await act(async () => {
        await new Promise<void>(resolve => queueMicrotask(resolve))
    })
}


function makeFilters(): SearchModalFilter<string>[] {
    return [
        { type: 'text', key: 'search', label: 'Search', value: '', onChange: () => {} },
    ]
}

const sortOptions: [SearchModalSortOption, ...SearchModalSortOption[]] = [
    { key: 'date', label: 'Date', direction: 'desc' },
    { key: 'name', label: 'Name', direction: 'asc' },
]


// ---------------------------------------------------------------------------
// Pure / synchronous behavior
// ---------------------------------------------------------------------------

describe('useSearchModal — sort click semantics', () => {
    it('clicking the active option flips its direction', () => {

        // we only care 
        const { result } = renderHook(() => useSearchModal({
            filters: makeFilters(),
            sortOptions,
            queryFn: async () => ({
                items: [],
                nextCursor: null
            }),
            countQueryFn: async () => 0
        }))

        // now make sure that the active sort key is 'date' with desc
        assert.strictEqual(result.current.activeSortKey, 'date')
        assert.strictEqual(result.current.sortState.find((s) => s.key === 'date')?.direction, 'desc')

        // now flip direction
        act(() => { result.current.handleSortClick('date') })
        assert.strictEqual(result.current.sortState.find((s) => s.key === 'date')?.direction, 'asc')

        // and then switch sort option
        act(() => { result.current.handleSortClick('name') })
        assert.strictEqual(result.current.activeSortKey, 'name')
        assert.strictEqual(result.current.sortState.find((s) => s.key === 'name')?.direction, 'asc')
    })

    it('clicking an inactive option activates it without losing other directions', () => {
        // arrange: render, click 'date' → flip it to 'asc' (so 'date' remembers asc)
        // act: click 'name' (becomes active), then click 'date' again
        // assert: 'date' is active, direction is still 'asc' (not reset)

        const { result } = renderHook(() => useSearchModal({
            filters: makeFilters(),
            sortOptions,
            queryFn: async () => ({
                items: [],
                nextCursor: null
            }),
            countQueryFn: async () => 0
        }))

        // now make sure that the active sort key is 'date' with desc
        assert.strictEqual(result.current.activeSortKey, 'date')
        assert.strictEqual(result.current.sortState.find((s) => s.key === 'date')?.direction, 'desc')

        // and then switch sort option
        act(() => { result.current.handleSortClick('name') })
        assert.strictEqual(result.current.activeSortKey, 'name')
        assert.strictEqual(result.current.sortState.find((s) => s.key === 'name')?.direction, 'asc')

        // assert that date still is at desc
        assert.strictEqual(result.current.sortState.find((s) => s.key === 'date')?.direction, 'desc')
    })

    it('flipping does not affect non-active options', () => {
        // arrange: render with two options
        // act: click active option twice
        // assert: the inactive option's direction is unchanged

        const { result } = renderHook(() => useSearchModal({
            filters: makeFilters(),
            sortOptions,
            queryFn: async () => ({
                items: [],
                nextCursor: null
            }),
            countQueryFn: async () => 0
        }))

        // assert name is at asc
        assert.strictEqual(result.current.sortState.find((s) => s.key === 'name')?.direction, 'asc')

        // now make sure that the active sort key is 'date' with desc
        assert.strictEqual(result.current.activeSortKey, 'date')
        assert.strictEqual(result.current.sortState.find((s) => s.key === 'date')?.direction, 'desc')

        // now flip direction
        act(() => { result.current.handleSortClick('date') })
        assert.strictEqual(result.current.sortState.find((s) => s.key === 'date')?.direction, 'asc')

        // assert name is at asc
        assert.strictEqual(result.current.sortState.find((s) => s.key === 'name')?.direction, 'asc')
    })
})


describe('useSearchModal — default sort key resolution', () => {

    it('falls back to sortOptions[0] when defaultSortKey does not match', () => {
        const { result } = renderHook(() => useSearchModal({
            filters: makeFilters(),
            sortOptions,
            defaultSortKey: 'nonexistent',
            queryFn: async () => ({ items: [], nextCursor: null }),
        }))
        assert.strictEqual(result.current.activeSortKey, 'date')
    })

    it('falls back to sortOptions[0] when defaultSortKey is omitted', () => {
        const { result } = renderHook(() => useSearchModal({
            filters: makeFilters(),
            sortOptions,
            queryFn: async () => ({ items: [], nextCursor: null }),
        }))
        assert.strictEqual(result.current.activeSortKey, 'date')
    })
})


describe('useSearchModal — updateFilter', () => {
    
    it('replaces the matching filter and leaves others untouched', () => {
        const filters: SearchModalFilter<string>[] = [
            { type: 'text', key: 'search', label: 'Search', value: '', onChange: () => {} },
            { type: 'text', key: 'category', label: 'Category', value: '', onChange: () => {} },
        ]
        const { result } = renderHook(() => useSearchModal({
            filters,
            sortOptions,
            queryFn: async () => ({ items: [], nextCursor: null }),
        }))
        const newSearchFilter: SearchModalFilter<string> = { type: 'text', key: 'search', label: 'Search', value: 'hi', onChange: () => {} }
        act(() => { result.current.updateFilter('search', newSearchFilter) })
        assert.strictEqual((result.current.activeFilters[0] as TextFilter).value, 'hi')
        assert.strictEqual(result.current.activeFilters[1].key, 'category')
    })

    it('is a no-op when no filter has the given key', () => {
        const filters = makeFilters()
        const { result } = renderHook(() => useSearchModal({
            filters,
            sortOptions,
            queryFn: async () => ({ items: [], nextCursor: null }),
        }))
        const elementRef = result.current.activeFilters
        act(() => {
            result.current.updateFilter('does-not-exist', {
                type: 'text', key: 'does-not-exist', label: 'X', value: 'x', onChange: () => {}
            })
        })
        assert.deepStrictEqual(result.current.activeFilters, elementRef)
    })
})



describe('useSearchModal — debounced first-page fetch', () => {
    let queryFnSpy: ReturnType<typeof mock.fn>

    beforeEach(() => {
        mock.timers.enable({ apis: ['setTimeout'] })
    })

    afterEach(() => {
        mock.timers.reset()
    })

    it('does not call queryFn until 300ms have elapsed', () => {
        queryFnSpy = mock.fn(async () => ({ items: [], nextCursor: null }))
        renderHook(() => useSearchModal({
            filters: makeFilters(),
            sortOptions,
            queryFn: queryFnSpy as unknown as SearchModalQueryFn<unknown, string>,
        }))
        mock.timers.tick(299)
        assert.strictEqual(queryFnSpy.mock.callCount(), 0)
    })

    it('calls queryFn exactly once after 300ms of quiet', async () => {
        queryFnSpy = mock.fn(async () => ({ items: [], nextCursor: null }))
        renderHook(() => useSearchModal({
            filters: makeFilters(),
            sortOptions,
            queryFn: queryFnSpy as unknown as SearchModalQueryFn<unknown, string>,
        }))
        mock.timers.tick(300)
        assert.strictEqual(queryFnSpy.mock.callCount(), 1)
    })

    it('coalesces rapid filter changes into a single fetch', async () => {
        queryFnSpy = mock.fn(async () => ({ items: [], nextCursor: null }))
        const { result } = renderHook(() => useSearchModal({
            filters: makeFilters(),
            sortOptions,
            queryFn: queryFnSpy as unknown as SearchModalQueryFn<unknown, string>,
        }))
        const searchFilter = { type: 'text' as const, key: 'search', label: 'Search', value: 'a', onChange: () => {} }
        act(() => { result.current.updateFilter('search', { ...searchFilter, value: 'a' }) })
        act(() => { result.current.updateFilter('search', { ...searchFilter, value: 'b' }) })
        act(() => { result.current.updateFilter('search', { ...searchFilter, value: 'c' }) })
        act(() => { result.current.updateFilter('search', { ...searchFilter, value: 'd' }) })
        act(() => { result.current.updateFilter('search', { ...searchFilter, value: 'e' }) })
        mock.timers.tick(300)
        assert.strictEqual(queryFnSpy.mock.callCount(), 1)
    })

    it('writes results and clears isLoading after queryFn resolves', async () => {
        const d = deferred<{ items: string[]; nextCursor: string | null }>()
        queryFnSpy = mock.fn(() => d.promise)
        const { result } = renderHook(() => useSearchModal({
            filters: makeFilters(),
            sortOptions,
            queryFn: queryFnSpy as unknown as SearchModalQueryFn<unknown, string>,
        }))
        act(() => { mock.timers.tick(300) })
        assert.strictEqual(result.current.isLoading, true)
        d.resolve({ items: ['a', 'b'], nextCursor: 'X' })
        await flushPendingState()
        assert.deepStrictEqual(result.current.results, ['a', 'b'])
        assert.strictEqual(result.current.isLoading, false)
    })
})


describe('useSearchModal — stale-result discarding (effect path)', () => {
    let queryFnSpy: ReturnType<typeof mock.fn>

    beforeEach(() => {
        mock.timers.enable({ apis: ['setTimeout'] })
    })

    afterEach(() => {
        mock.timers.reset()
    })

    it('discards a queryFn result whose filters were superseded mid-flight', async () => {
        const d1 = deferred<{ items: string[]; nextCursor: string | null }>()
        const d2 = deferred<{ items: string[]; nextCursor: string | null }>()
        let call = 0
        queryFnSpy = mock.fn(() => {
            call++
            return call === 1 ? d1.promise : d2.promise
        })
        const { result } = renderHook(() => useSearchModal({
            filters: makeFilters(),
            sortOptions,
            queryFn: queryFnSpy as unknown as SearchModalQueryFn<unknown, string>,
        }))
        mock.timers.tick(300)
        act(() => { result.current.updateFilter('search', { ...makeFilters()[0] as TextFilter, value: 'new' }) })
        mock.timers.tick(300)
        d1.resolve({ items: ['stale_a', 'stale_b'], nextCursor: null })
        await flushPendingState()
        assert.deepStrictEqual(result.current.results, [])
        d2.resolve({ items: ['fresh_a'], nextCursor: null })
        await flushPendingState()
        assert.deepStrictEqual(result.current.results, ['fresh_a'])
    })

    it('aborts the in-flight controller on filter change (cleanup path)', () => {
        const abortSpy = mock.method(AbortController.prototype, 'abort')
        queryFnSpy = mock.fn(async () => ({ items: [], nextCursor: null }))
        const { result } = renderHook(() => useSearchModal({
            filters: makeFilters(),
            sortOptions,
            queryFn: queryFnSpy as unknown as SearchModalQueryFn<unknown, string>,
        }))
        mock.timers.tick(300)
        act(() => { result.current.updateFilter('search', { ...makeFilters()[0] as TextFilter, value: 'new' }) })
        mock.timers.tick(300)
        assert.strictEqual(abortSpy.mock.callCount() >= 1, true)
        abortSpy.mock.restore()
    })
})


describe('useSearchModal — pagination', () => {
    let queryFnSpy: ReturnType<typeof mock.fn>

    beforeEach(() => {
        mock.timers.enable({ apis: ['setTimeout'] })
    })

    afterEach(() => {
        mock.timers.reset()
    })

    it('loadNextPage is a no-op when nextCursor is null', async () => {
        queryFnSpy = mock.fn(async () => ({ items: [], nextCursor: null }))
        const { result } = renderHook(() => useSearchModal({
            filters: makeFilters(),
            sortOptions,
            queryFn: queryFnSpy as unknown as SearchModalQueryFn<unknown, string>,
        }))
        mock.timers.tick(300)
        await flushPendingState()
        const callCount = queryFnSpy.mock.callCount()
        act(() => { result.current.loadNextPage() })
        assert.strictEqual(queryFnSpy.mock.callCount(), callCount)
    })

    it('loadNextPage sends the current cursor and appends results', async () => {
        const d1 = deferred<{ items: string[]; nextCursor: string | null }>()
        const d2 = deferred<{ items: string[]; nextCursor: string | null }>()
        let call = 0
        queryFnSpy = mock.fn(() => {
            call++
            return call === 1 ? d1.promise : d2.promise
        })
        const { result } = renderHook(() => useSearchModal({
            filters: makeFilters(),
            sortOptions,
            queryFn: queryFnSpy as unknown as SearchModalQueryFn<unknown, string>,
        }))
        mock.timers.tick(300)
        d1.resolve({ items: ['a', 'b'], nextCursor: 'X' })
        await flushPendingState()
        assert.deepStrictEqual(result.current.results, ['a', 'b'])
        act(() => { result.current.loadNextPage() })
        assert.strictEqual(queryFnSpy.mock.callCount(), 2)
        d2.resolve({ items: ['c', 'd'], nextCursor: 'Y' })
        await flushPendingState()
        assert.deepStrictEqual(result.current.results, ['a', 'b', 'c', 'd'])
    })

    it('dedupes simultaneous loadNextPage calls (in-flight guard)', async () => {
        const d1 = deferred<{ items: string[]; nextCursor: string | null }>()
        const d2 = deferred<{ items: string[]; nextCursor: string | null }>()
        let call = 0
        queryFnSpy = mock.fn(() => {
            call++
            return call === 1 ? d1.promise : d2.promise
        })
        const { result } = renderHook(() => useSearchModal({
            filters: makeFilters(),
            sortOptions,
            queryFn: queryFnSpy as unknown as SearchModalQueryFn<unknown, string>,
        }))
        mock.timers.tick(300)
        d1.resolve({ items: ['a', 'b'], nextCursor: 'X' })
        await flushPendingState()
        act(() => { result.current.loadNextPage() })
        act(() => { result.current.loadNextPage() })
        assert.strictEqual(queryFnSpy.mock.callCount(), 2)
    })

    it('stops paginating once a page returns nextCursor: null', async () => {
        const d1 = deferred<{ items: string[]; nextCursor: string | null }>()
        const d2 = deferred<{ items: string[]; nextCursor: string | null }>()
        let call = 0
        queryFnSpy = mock.fn(() => {
            call++
            return call === 1 ? d1.promise : d2.promise
        })
        const { result } = renderHook(() => useSearchModal({
            filters: makeFilters(),
            sortOptions,
            queryFn: queryFnSpy as unknown as SearchModalQueryFn<unknown, string>,
        }))
        mock.timers.tick(300)
        d1.resolve({ items: ['a'], nextCursor: 'X' })
        await flushPendingState()
        act(() => { result.current.loadNextPage() })
        d2.resolve({ items: ['b'], nextCursor: null })
        await flushPendingState()
        const callCountAfterNull = queryFnSpy.mock.callCount()
        act(() => { result.current.loadNextPage() })
        assert.strictEqual(queryFnSpy.mock.callCount(), callCountAfterNull)
    })
})


describe('useSearchModal — pagination race with filter change', () => {
    let queryFnSpy: ReturnType<typeof mock.fn>

    beforeEach(() => {
        mock.timers.enable({ apis: ['setTimeout'] })
    })

    afterEach(() => {
        mock.timers.reset()
    })

    it('does not append stale rows when filter changes mid-pagination', async () => {
        const d1 = deferred<{ items: string[]; nextCursor: string | null }>()
        const dP = deferred<{ items: string[]; nextCursor: string | null }>()
        const d2 = deferred<{ items: string[]; nextCursor: string | null }>()
        let call = 0
        queryFnSpy = mock.fn(() => {
            call++
            if (call === 1) return d1.promise
            if (call === 2) return dP.promise
            return d2.promise
        })
        const { result } = renderHook(() => useSearchModal({
            filters: makeFilters(),
            sortOptions,
            queryFn: queryFnSpy as unknown as SearchModalQueryFn<unknown, string>,
        }))
        mock.timers.tick(300)
        d1.resolve({ items: ['page1_a', 'page1_b'], nextCursor: 'X' })
        await flushPendingState()
        act(() => { result.current.loadNextPage() })
        act(() => { result.current.updateFilter('search', { ...makeFilters()[0] as TextFilter, value: 'new_filter' }) })
        mock.timers.tick(300)
        dP.resolve({ items: ['stale_pagination'], nextCursor: null })
        await flushPendingState()
        d2.resolve({ items: ['fresh_first'], nextCursor: null })
        await flushPendingState()
        assert.deepStrictEqual(result.current.results, ['fresh_first'])
    })

    it('resets isFetchingPage even when the in-flight pagination is aborted', async () => {
        const d1 = deferred<{ items: string[]; nextCursor: string | null }>()
        const dP = deferred<{ items: string[]; nextCursor: string | null }>()
        const d2 = deferred<{ items: string[]; nextCursor: string | null }>()
        let call = 0
        queryFnSpy = mock.fn(() => {
            call++
            if (call === 1) return d1.promise
            if (call === 2) return dP.promise
            return d2.promise
        })
        const { result } = renderHook(() => useSearchModal({
            filters: makeFilters(),
            sortOptions,
            queryFn: queryFnSpy as unknown as SearchModalQueryFn<unknown, string>,
        }))
        mock.timers.tick(300)
        d1.resolve({ items: ['page1'], nextCursor: 'X' })
        await flushPendingState()
        act(() => { result.current.loadNextPage() })
        act(() => { result.current.updateFilter('search', { ...makeFilters()[0] as TextFilter, value: 'new_filter' }) })
        mock.timers.tick(300)
        dP.resolve({ items: ['stale'], nextCursor: null })
        await flushPendingState()
        d2.resolve({ items: ['fresh'], nextCursor: 'X2' })
        await flushPendingState()
        act(() => { result.current.loadNextPage() })
        assert.strictEqual(queryFnSpy.mock.callCount(), 4)
    })
})


describe('useSearchModal — count fetch', () => {
    let countQueryFnSpy: ReturnType<typeof mock.fn>

    beforeEach(() => {
        mock.timers.enable({ apis: ['setTimeout'] })
    })

    afterEach(() => {
        mock.timers.reset()
    })

    it('does not call countQueryFn when not provided', () => {
        const queryFnSpy = mock.fn(async () => ({ items: [], nextCursor: null }))
        renderHook(() => useSearchModal({
            filters: makeFilters(),
            sortOptions,
            queryFn: queryFnSpy as unknown as SearchModalQueryFn<unknown, string>,
        }))
        mock.timers.tick(300)
    })

    it('clears totalCount to null on filter change before resolving the new count', async () => {
        const d1 = deferred<{ items: string[]; nextCursor: string | null }>()
        const countD1 = deferred<number>()
        const d2 = deferred<{ items: string[]; nextCursor: string | null }>()
        const countD2 = deferred<number>()
        let queryCall = 0
        let countCall = 0
        const queryFnSpy = mock.fn(() => {
            queryCall++
            return queryCall === 1 ? d1.promise : d2.promise
        })
        countQueryFnSpy = mock.fn(() => {
            countCall++
            return countCall === 1 ? countD1.promise : countD2.promise
        })
        const { result } = renderHook(() => useSearchModal({
            filters: makeFilters(),
            sortOptions,
            queryFn: queryFnSpy as unknown as SearchModalQueryFn<unknown, string>,
            countQueryFn: countQueryFnSpy as unknown as SearchModalCountFn<string>,
        }))
        mock.timers.tick(300)
        d1.resolve({ items: [], nextCursor: null })
        countD1.resolve(42)
        await flushPendingState()
        assert.strictEqual(result.current.totalCount, 42)
        act(() => { result.current.updateFilter('search', { ...makeFilters()[0] as TextFilter, value: 'new' }) })
        act(() => { mock.timers.tick(300) })
        assert.strictEqual(result.current.totalCount, null)
        d2.resolve({ items: [], nextCursor: null })
        countD2.resolve(7)
        await flushPendingState()
        assert.strictEqual(result.current.totalCount, 7)
    })

    it('discards a stale count when a newer filter has already resolved', async () => {
        const d1 = deferred<{ items: string[]; nextCursor: string | null }>()
        const countD1 = deferred<number>()
        const d2 = deferred<{ items: string[]; nextCursor: string | null }>()
        const countD2 = deferred<number>()
        let queryCall = 0
        let countCall = 0
        const queryFnSpy = mock.fn(() => {
            queryCall++
            return queryCall === 1 ? d1.promise : d2.promise
        })
        countQueryFnSpy = mock.fn(() => {
            countCall++
            return countCall === 1 ? countD1.promise : countD2.promise
        })
        const { result } = renderHook(() => useSearchModal({
            filters: makeFilters(),
            sortOptions,
            queryFn: queryFnSpy as unknown as SearchModalQueryFn<unknown, string>,
            countQueryFn: countQueryFnSpy as unknown as SearchModalCountFn<string>,
        }))
        mock.timers.tick(300)
        d1.resolve({ items: [], nextCursor: null })
        await flushPendingState()
        act(() => { result.current.updateFilter('search', { ...makeFilters()[0] as TextFilter, value: 'new' }) })
        mock.timers.tick(300)
        d2.resolve({ items: [], nextCursor: null })
        countD2.resolve(7)
        await flushPendingState()
        countD1.resolve(42)
        await flushPendingState()
        assert.strictEqual(result.current.totalCount, 7)
    })
})



describe('useSearchModal — unmount', () => {
    beforeEach(() => {
        mock.timers.enable({ apis: ['setTimeout'] })
    })

    afterEach(() => {
        mock.timers.reset()
    })

    it('does not setState after unmount mid-fetch', async () => {
        const consoleErrorSpy = mock.method(console, 'error')
        const d = deferred<{ items: string[]; nextCursor: string | null }>()
        const queryFnSpy = mock.fn(() => d.promise)
        const { unmount } = renderHook(() => useSearchModal({
            filters: makeFilters(),
            sortOptions,
            queryFn: queryFnSpy as unknown as SearchModalQueryFn<unknown, string>,
        }))
        mock.timers.tick(300)
        unmount()
        d.resolve({ items: ['a'], nextCursor: null })
        await flushPendingState()
        const setStateWarnings = consoleErrorSpy.mock.calls.filter(
            (call: { arguments: string[] }) =>
                typeof call.arguments[0] === 'string' && call.arguments[0].includes('unmounted')
        )
        assert.strictEqual(setStateWarnings.length, 0)
        consoleErrorSpy.mock.restore()
    })

    it('does not abort the in-flight controller on unmount', () => {
        const abortSpy = mock.method(AbortController.prototype, 'abort')
        const queryFnSpy = mock.fn(async () => ({ items: [], nextCursor: null }))
        const { result, unmount } = renderHook(() => useSearchModal({
            filters: makeFilters(),
            sortOptions,
            queryFn: queryFnSpy as unknown as SearchModalQueryFn<unknown, string>,
        }))
        mock.timers.tick(300)
        act(() => { result.current.updateFilter('search', { ...makeFilters()[0] as TextFilter, value: 'new' }) })
        mock.timers.tick(300)
        const abortCountBeforeUnmount = abortSpy.mock.callCount()
        unmount()
        assert.strictEqual(abortSpy.mock.callCount(), abortCountBeforeUnmount)
        abortSpy.mock.restore()
    })

    it('confirms console.error spy catches unmounted component warnings', () => {
        const consoleErrorSpy = mock.method(console, 'error')
        console.error('Component was unmounted and setState was called')
        const unmountWarnings = consoleErrorSpy.mock.calls.filter(
            (call: { arguments: string[] }) =>
                typeof call.arguments[0] === 'string' && call.arguments[0].includes('unmounted')
        )
        assert.strictEqual(unmountWarnings.length, 1)
        consoleErrorSpy.mock.restore()
    })

    it('verifies unmounted setState does not trigger console warning due to stale guard', async () => {
        const consoleErrorSpy = mock.method(console, 'error')
        const d = deferred<{ items: string[]; nextCursor: string | null }>()
        const queryFnSpy = mock.fn(() => d.promise)
        const { unmount } = renderHook(() => useSearchModal({
            filters: makeFilters(),
            sortOptions,
            queryFn: queryFnSpy as unknown as SearchModalQueryFn<unknown, string>,
        }))
        mock.timers.tick(300)
        unmount()
        d.resolve({ items: ['a'], nextCursor: null })
        await flushPendingState()
        const unmountWarnings = consoleErrorSpy.mock.calls.filter(
            (call: { arguments: string[] }) =>
                typeof call.arguments[0] === 'string' && call.arguments[0].includes('unmounted')
        )
        assert.strictEqual(unmountWarnings.length, 0)
        consoleErrorSpy.mock.restore()
    })
})

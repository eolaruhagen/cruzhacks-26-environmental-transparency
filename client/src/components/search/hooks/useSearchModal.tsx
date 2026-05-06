import { useCallback, useEffect, useRef, useState } from 'react'
import {
    SearchModalCountFn,
    SearchModalFilter,
    SearchModalQueryFn,
    SearchModalSortOption,
} from '../ui/SearchModal'

export interface UseSearchModalOptions<T, K extends React.Key> {
    filters: SearchModalFilter<K>[]
    sortOptions: [SearchModalSortOption, ...SearchModalSortOption[]]
    defaultSortKey?: string
    queryFn: SearchModalQueryFn<T, K>
    countQueryFn?: SearchModalCountFn<K>
}

// doesnt need to extend react key here only the searchmodal needs it for indexing instances of
// the searchmodal filter component
export interface UseSearchModalResult<T, K extends React.Key> {
    activeFilters: SearchModalFilter<K>[]
    sortState: SearchModalSortOption[]
    activeSortKey: string
    updateFilter: (key: string, value: SearchModalFilter<K>) => void
    handleSortClick: (key: string) => void
    results: T[]
    totalCount: number | null
    isLoading: boolean
    loadNextPage: () => void
}

export function useSearchModal<T, K extends React.Key>({
    filters,
    sortOptions,
    defaultSortKey,
    queryFn,
    countQueryFn,
}: UseSearchModalOptions<T, K>): UseSearchModalResult<T, K> {
    const [activeFilters, setActiveFilters] = useState<SearchModalFilter<K>[]>(filters)

    // Hook owns the sort options' direction state after mount — caller-provided
    // direction is the initial value only. This is how clicking an active option flips
    // its direction without losing other options' remembered directions.
    const [sortState, setSortState] = useState<SearchModalSortOption[]>(() => sortOptions.map(o => ({ ...o })))

    // Resolve initial active key: caller-specified if it matches an option, else first.
    const initialSortKey =
        defaultSortKey && sortOptions.some((s) => s.key === defaultSortKey)
            ? defaultSortKey
            : sortOptions[0].key
    const [activeSortKey, setActiveSortKey] = useState<string>(initialSortKey)
    const activeSort = sortState.find((s) => s.key === activeSortKey) ?? sortState[0]

    const updateFilter = useCallback((key: string, value: SearchModalFilter<K>) => {
        setActiveFilters((prev) => prev.map((f) => (f.key === key ? value : f)))
    }, [])

    // Click semantics: clicking an inactive option activates it (with its current
    // remembered direction); clicking the active option flips its direction.
    const handleSortClick = useCallback((key: string) => {
        if (key === activeSortKey) {
            setSortState(prev => prev.map(s =>
                s.key === key
                    ? { ...s, direction: s.direction === 'asc' ? 'desc' : 'asc' }
                    : s
            ))
        } else {
            setActiveSortKey(key)
        }
    }, [activeSortKey])

    // Hook-owned data state. Parent reads these directly from the hook return value.
    const [results, setResults] = useState<T[]>([])
    const [totalCount, setTotalCount] = useState<number | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const [nextCursor, setNextCursor] = useState<string | null>(null)
    const [isFetchingPage, setIsFetchingPage] = useState(false)

    // Debounced first-page fetch + count: waits 300ms after last filter/sort change, discards stale results.
    const abortController = useRef<AbortController | null>(null)

    useEffect(() => {
        let stale = false
        const timeout = setTimeout(() => {
            // abort the controller -> the signal is going to be read by loadNextPage
            // prevents pageLoads finishing when filters/sort have changed
            abortController.current?.abort()
            const controller = new AbortController()
            abortController.current = controller
            setNextCursor(null)
            setIsLoading(true)
            queryFn(activeFilters, activeSort, null).then(result => {
                if (stale) return
                setResults(result.items)
                setNextCursor(result.nextCursor ?? null)
                setIsLoading(false)
            })
            if (countQueryFn) {
                setTotalCount(null)
                countQueryFn(activeFilters).then(c => {
                    if (!stale) setTotalCount(c)
                })
            }
        }, 300)
        return () => {
            stale = true
            clearTimeout(timeout)
        }
    }, [activeFilters, activeSort, queryFn, countQueryFn])

    const loadNextPage = useCallback(() => {
        // get handle to current signal in the ref
        const currentSignal = abortController.current?.signal
        if (!nextCursor || isFetchingPage) return
        setIsFetchingPage(true)
        queryFn(activeFilters, activeSort, nextCursor).then(result => {
            if (currentSignal?.aborted) {
                setIsFetchingPage(false)
                return
            }
            setResults(prev => [...prev, ...result.items])
            setNextCursor(result.nextCursor ?? null)
            setIsFetchingPage(false)
        })
    }, [nextCursor, isFetchingPage, activeFilters, activeSort, queryFn])

    return {
        // UI-level state for the SearchModal component
        activeFilters,
        sortState,
        activeSortKey,
        updateFilter,
        handleSortClick,
        // Data-level state for the parent's results UI
        results,
        totalCount,
        isLoading,
        loadNextPage,
    }
}


'use client'

import { useCallback, useEffect, useState } from "react"

export interface DiscreteFilter<K extends React.Key> {
    type: 'discrete'
    key: string
    label: string
    options: { id: K; label: string }[]
    selected: Set<K>
    toggle: (value: K) => void
}

export interface RangeFilter {
    type: 'range'
    key: string
    label: string
    min: number
    max: number
    value: [number, number]
    onChange: (value: [number, number]) => void
}

export interface TextFilter {
    type: 'text'
    key: string
    label: string
    value: string
    placeholder?: string
    onChange: (value: string) => void
}


/** Date range filtering, uses its own dropdown with day level granularity */
export interface DateRangeFilter {
    type: 'date-range'
    key: string
    label: string
    value: [Date, Date]
    onChange: (value: [Date, Date]) => void
}


/** Discriminated union of all filter types: meant for use by SearchModal */
export type SearchModalFilter<K extends React.Key = string> = DiscreteFilter<K> | RangeFilter | TextFilter | DateRangeFilter


export interface SearchModalProps<T, K extends React.Key> {
    filters: SearchModalFilter<K>[]
    queryFn: (filters: SearchModalFilter<K>[]) => Promise<T[]>
    setResults: (results: T[]) => void
}


export function SearchModal<T, K extends React.Key>({ filters, queryFn, setResults }: SearchModalProps<T, K>) {
    const [activeFilters, setActiveFilters] = useState<SearchModalFilter<K>[]>(filters)

    const updateFilter = useCallback((key: string, value: SearchModalFilter<K>) => {
        setActiveFilters((prev) => prev.map((f) => (f.key === key ? value : f)))
    }, [])

    // Debounced autosubmission: waits 300ms after last filter change, discards stale results
    useEffect(() => {
        let stale = false;
        const timeout = setTimeout(() => {
            queryFn(activeFilters).then(results => {
                if (!stale) setResults(results)
            })
        }, 300)
        return () => {
            stale = true;
            clearTimeout(timeout);
        }
    }, [activeFilters, queryFn, setResults])

    // Track whether we've seen the first non-text filter to default it open
    let firstNonTextSeen = false

    return (
        <div className="wf-section space-y-6">
            {activeFilters.map((filter) => {
                let defaultOpen = true
                if (filter.type !== 'text' && !firstNonTextSeen) {
                    defaultOpen = true
                    firstNonTextSeen = true
                }
                return <SearchModalFilterOption key={filter.key} filter={filter} updateFilter={updateFilter} defaultOpen={defaultOpen} />
            })}
        </div>
    )
}


function SearchModalFilterOption<K extends React.Key>({ filter, updateFilter, defaultOpen }: { filter: SearchModalFilter<K>, updateFilter: (key: string, value: SearchModalFilter<K>) => void, defaultOpen?: boolean }) {
    // Narrow the callback for each filter type — the child only sees its own value shape
    if (filter.type === 'text') {
        const onTextChange = (value: string) => updateFilter(filter.key, { ...filter, value })
        return <TextFilterUI filter={filter} onChange={onTextChange} />
    }

    const content = (() => {
        switch (filter.type) {
            case 'discrete': {
                const onToggle = (id: K) => {
                    const next = new Set(filter.selected)
                    next.has(id) ? next.delete(id) : next.add(id)
                    updateFilter(filter.key, { ...filter, selected: next })
                }
                return <DiscreteFilterUI filter={filter} onToggle={onToggle} />
            }
            case 'range': {
                const onRangeChange = (value: [number, number]) => updateFilter(filter.key, { ...filter, value })
                return <RangeFilterUI filter={filter} onChange={onRangeChange} />
            }
            case 'date-range': {
                const onDateChange = (value: [Date, Date]) => updateFilter(filter.key, { ...filter, value })
                return <DateRangeFilterUI filter={filter} onChange={onDateChange} />
            }
        }
    })()

    return (
        <FilterBox label={filter.label} defaultOpen={defaultOpen}>
            {content}
        </FilterBox>
    )
}


function DateRangeFilterUI({ filter, onChange }: { filter: DateRangeFilter, onChange: (value: [Date, Date]) => void }) {
    return (
        <div>
            <div className="flex items-center gap-4">
                <span className="text-sm font-mono text-main whitespace-nowrap px-3 py-1">
                    from
                </span>
                <input
                    type="date"
                    value={filter.value[0].toISOString().split('T')[0]}
                    onChange={(e) => onChange([new Date(e.target.value), filter.value[1]])}
                    className="wf-input"
                />
                <span className="text-sm font-mono text-main whitespace-nowrap px-3 py-1">
                    to
                </span>
                <input
                    type="date"
                    value={filter.value[1].toISOString().split('T')[0]}
                    onChange={(e) => onChange([filter.value[0], new Date(e.target.value)])}
                    className="wf-input"
                />
            </div>
        </div>
    )
}

function DiscreteFilterUI<K extends React.Key>({ filter, onToggle }: { filter: DiscreteFilter<K>, onToggle: (id: K) => void }) {
    return (
        <div>
            <div className="flex flex-wrap gap-2">
                {filter.options.map((option) => (
                    <button
                        key={option.id}
                        onClick={() => onToggle(option.id)}
                        className={filter.selected.has(option.id) ? 'wf-btn-active' : 'wf-btn'}
                    >
                        {option.label}
                    </button>
                ))}
            </div>
        </div>
    )
}


function RangeFilterUI({ filter, onChange }: { filter: RangeFilter, onChange: (value: [number, number]) => void }) {
    const handleMinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newMin = Number(e.target.value)
        onChange([Math.min(newMin, filter.value[1]), filter.value[1]])
    }

    const handleMaxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newMax = Number(e.target.value)
        onChange([filter.value[0], Math.max(newMax, filter.value[0])])
    }

    return (
        <div>
            <div className="flex items-center gap-4">
                <input
                    type="range"
                    min={filter.min}
                    max={filter.max}
                    value={filter.value[0]}
                    onChange={handleMinChange}
                    className="flex-1 accent-[var(--color-accent)]"
                />
                <span className="text-sm font-mono text-main whitespace-nowrap px-3 py-1">
                    {filter.value[0]} – {filter.value[1]}
                </span>
                <input
                    type="range"
                    min={filter.min}
                    max={filter.max}
                    value={filter.value[1]}
                    onChange={handleMaxChange}
                    className="flex-1 accent-[var(--color-accent)]"
                />
            </div>
        </div>
    )
}

function TextFilterUI({ filter, onChange }: { filter: TextFilter, onChange: (value: string) => void }) {
    return (
        <div>
            <p className="wf-label mb-3">{filter.label}</p>
            <input
                type="text"
                value={filter.value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={filter.placeholder ?? `Filter by ${filter.label.toLowerCase()}...`}
                className="wf-input"
            />
        </div>
    )
}

/** Collapsible wrapper for a filter section. Animates open/close with CSS Grid. */
function FilterBox({ label, defaultOpen, children }: { label: string; defaultOpen?: boolean; children: React.ReactNode }) {
    const [open, setOpen] = useState(defaultOpen ?? false)

    return (
        <div>
            <button
                onClick={() => setOpen(!open)}
                className="flex items-center justify-between w-full text-left group"
            >
                <p className="text-xs font-mono uppercase tracking-widest text-light">{label}</p>
                <svg
                    className={`w-4 h-4 text-light transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>
            <div className={`grid transition-[grid-template-rows] duration-200 ease-in-out ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                <div className="overflow-hidden">
                    <div className="pt-3">
                        {children}
                    </div>
                </div>
            </div>
        </div>
    )
}
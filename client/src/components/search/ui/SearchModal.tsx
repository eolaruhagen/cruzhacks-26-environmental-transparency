'use client'

import { useState } from "react"
import { Card } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"

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


type SortOptionDirection = 'asc' | 'desc'
export interface SearchModalSortOption {
    key: string // column tie
    label: string // user visible label
    direction: SortOptionDirection
}



/** Discriminated union of all filter types: meant for use by SearchModal */
export type SearchModalFilter<K extends React.Key = string> = DiscreteFilter<K> | RangeFilter | TextFilter | DateRangeFilter


export interface PaginatedQueryResult<T> {
    items: T[]
    nextCursor?: string | null  // null/undefined = no more pages
}

export type SearchModalQueryFn<T, K extends React.Key> = (
    filters: SearchModalFilter<K>[],
    sort: SearchModalSortOption,
    cursor: string | null,  // null = first page
) => Promise<PaginatedQueryResult<T>>

export type SearchModalCountFn<K extends React.Key> = (
    filters: SearchModalFilter<K>[],
) => Promise<number>

export interface SearchModalProps<K extends React.Key> {
    /** Current filter list (state owned by the caller — usually via useSearchModal). */
    activeFilters: SearchModalFilter<K>[]
    /** Current sort options array, including each option's remembered direction. */
    sortState: SearchModalSortOption[]
    /** Key of the currently-active sort option. */
    activeSortKey: string
    /** Replace one filter (matched by key) with a new value. */
    onFilterUpdate: (key: string, value: SearchModalFilter<K>) => void
    /** Inactive option key → activate; active option key → flip its direction. */
    onSortClick: (key: string) => void
}


export function SearchModal<K extends React.Key>({
    activeFilters,
    sortState,
    activeSortKey,
    onFilterUpdate,
    onSortClick,
}: SearchModalProps<K>) {
    // Track whether we've seen the first non-text filter to default it open
    let firstNonTextSeen = false

    return (
        <Card variant="section" className="space-y-6">
            <SortBar options={sortState} activeKey={activeSortKey} onClick={onSortClick} />
            {activeFilters.map((filter) => {
                let defaultOpen = true
                if (filter.type !== 'text' && !firstNonTextSeen) {
                    defaultOpen = true
                    firstNonTextSeen = true
                }
                return <SearchModalFilterOption key={filter.key} filter={filter} updateFilter={onFilterUpdate} defaultOpen={defaultOpen} />
            })}
        </Card>
    )
}


/** Sort selector — visually distinct from filter UI: always-visible row at the top
 *  (no collapsible FilterBox), single-active-at-a-time, each option carries its own
 *  ↑/↓ direction chevron. Click inactive → activate. Click active → flip direction. */
function SortBar({
    options,
    activeKey,
    onClick,
}: {
    options: ReadonlyArray<SearchModalSortOption>
    activeKey: string
    onClick: (key: string) => void
}) {
    return (
        <div className="flex items-center flex-wrap gap-x-3 gap-y-2 pb-4 border-b border-border">
            <p className="wf-label whitespace-nowrap">Sort by</p>
            <div className="flex flex-wrap gap-2">
                {options.map((option) => {
                    const isActive = option.key === activeKey
                    return (
                        <Button
                            key={option.key}
                            variant={isActive ? 'active' : 'default'}
                            onClick={() => onClick(option.key)}
                            className="flex flex-col items-center justify-center leading-none !py-1"
                            aria-pressed={isActive}
                            title={isActive ? 'Click to flip direction' : 'Click to sort by this field'}
                        >
                            <span>{option.label}</span>
                            {isActive && (
                                <span className="text-[10px] font-light">
                                    {option.direction === 'asc' ? 'Ascending' : 'Descending'}
                                </span>
                            )}
                        </Button>
                    )
                })}
            </div>
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
                    <Button
                        key={option.id}
                        variant={filter.selected.has(option.id) ? 'active' : 'default'}
                        onClick={() => onToggle(option.id)}
                    >
                        {option.label}
                    </Button>
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
            <div className="flex flex-wrap items-center gap-4">
                <input
                    type="range"
                    min={filter.min}
                    max={filter.max}
                    value={filter.value[0]}
                    onChange={handleMinChange}
                    className="flex-1 accent-[var(--color-accent)]"
                />
                <span className="text-sm font-mono text-main  px-3 py-1">
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
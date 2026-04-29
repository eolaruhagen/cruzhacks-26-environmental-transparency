'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { supabase } from '@/lib/supabase';
import { Bill, BillType } from '@/lib/types';
import { SearchModal, type SearchModalFilter, type DiscreteFilter, type TextFilter, type DateRangeFilter, type RangeFilter, type SearchModalSortOption, type PaginatedQueryResult, type SearchModalHandle } from '@/components/search/SearchModal';
import { BillSearchResult } from '@/components/search/SearchResultItem';

const PAGE_SIZE = 50;

// Filter option definitions
const BILL_TYPES: { id: BillType; label: string }[] = [
    { id: 'air_and_atmosphere', label: 'Air & Atmosphere' },
    { id: 'water_resources', label: 'Water Resources' },
    { id: 'waste_and_toxics', label: 'Waste & Toxics' },
    { id: 'energy_and_resources', label: 'Energy & Resources' },
    { id: 'land_and_conservation', label: 'Land & Conservation' },
    { id: 'disaster_and_emergency', label: 'Disaster & Emergency' },
    { id: 'climate_and_emissions', label: 'Climate & Emissions' },
    { id: 'justice_and_environment', label: 'Justice & Environment' },
];

const BILL_STATUSES = [
    { id: 'Introduced', label: 'Introduced' },
    { id: 'Passed House', label: 'Passed House' },
    { id: 'Passed Senate', label: 'Passed Senate' },
    { id: 'To President', label: 'To President' },
    { id: 'Became Law', label: 'Became Law' },
];

const PARTY_OPTIONS = [
    { id: 'Democrat', label: 'Democrat' },
    { id: 'Republican', label: 'Republican' },
];

// Initial filter definitions passed to SearchModal
const billFilters: SearchModalFilter<string>[] = [
    {
        type: 'text',
        key: 'search',
        label: 'Search Full Text',
        value: '',
        placeholder: 'Search by title, bill number, or sponsor...',
        onChange: () => { },
    },
    {
        type: 'discrete',
        key: 'category',
        label: 'Category',
        options: BILL_TYPES,
        selected: new Set<string>(),
        toggle: () => { },
    },
    {
        type: 'discrete',
        key: 'status',
        label: 'Status',
        options: BILL_STATUSES,
        selected: new Set<string>(),
        toggle: () => { },
    },
    {
        type: 'discrete',
        key: 'party',
        label: 'Party Affiliation',
        options: PARTY_OPTIONS,
        selected: new Set<string>(),
        toggle: () => { },
    },
    {
        type: 'date-range',
        key: 'date_of_introduction',
        label: 'Date of Introduction',
        value: [new Date('2023-01-01'), new Date()],
        onChange: () => { },
    },
    {
        type: 'range',
        key: 'num_cosponsors',
        label: 'Number of Cosponsors',
        min: 0,
        max: 200,
        value: [0, 200],
        onChange: () => { },
    },
];

// One option per sortable field. The `direction` is the initial direction —
// the modal toggles it when the user clicks an already-active option.
const billSortOptions: [SearchModalSortOption, ...SearchModalSortOption[]] = [
    { key: 'date_of_introduction', label: 'Date of introduction', direction: 'desc' },
    { key: 'num_cosponsors',       label: 'Cosponsors',           direction: 'desc' },
];

// Strip PostgREST filter metacharacters to prevent filter injection
function sanitizeFilterInput(input: string): string {
    return input.replace(/[(),."'\\]/g, '')
}

// Extracts and applies the shared filter chain used by both queryBills and countBills.
// Returns the still-chainable query — caller adds .order/.range or .select count modifiers.
// With no active filters the chain is a no-op and the query returns everything (subject to the
// caller's .range limit), giving the user instant default results on page load.
function buildFilteredBillsQuery<Q extends {
    in: (col: string, vals: readonly string[]) => Q;
    or: (filters: string) => Q;
    gte: (col: string, val: string | number) => Q;
    lte: (col: string, val: string | number) => Q;
}>(
    filters: SearchModalFilter<string>[],
    initialQuery: Q,
): Q {
    const searchFilter = filters.find((f): f is TextFilter => f.key === 'search' && f.type === 'text');
    const categoryFilter = filters.find((f): f is DiscreteFilter<string> => f.key === 'category' && f.type === 'discrete');
    const statusFilter = filters.find((f): f is DiscreteFilter<string> => f.key === 'status' && f.type === 'discrete');
    const partyFilter = filters.find((f): f is DiscreteFilter<string> => f.key === 'party' && f.type === 'discrete');
    const dateFilter = filters.find((f): f is DateRangeFilter => f.key === 'date_of_introduction' && f.type === 'date-range');
    const cosponsorFilter = filters.find((f): f is RangeFilter => f.key === 'num_cosponsors' && f.type === 'range');

    const searchQuery = sanitizeFilterInput(searchFilter?.value?.trim() ?? '');
    const selectedCategories = categoryFilter?.selected ?? new Set<string>();
    const selectedStatuses = statusFilter?.selected ?? new Set<string>();
    const selectedParties = partyFilter?.selected ?? new Set<string>();

    let query = initialQuery;

    if (selectedCategories.size > 0) {
        query = query.in('category', Array.from(selectedCategories) as BillType[]);
    }

    if (selectedStatuses.size > 0) {
        query = query.in('latest_tracker_stage', Array.from(selectedStatuses));
    }

    if (selectedParties.size > 0) {
        const partyFilters = Array.from(selectedParties)
            .map(p => `party_of_sponsor.ilike.%${sanitizeFilterInput(p)}%`)
            .join(',');
        query = query.or(partyFilters);
    }

    if (searchQuery) {
        query = query.or(`title.ilike.%${searchQuery}%,legislation_number.ilike.%${searchQuery}%,sponsor.ilike.%${searchQuery}%`);
    }

    if (dateFilter) {
        const [from, to] = dateFilter.value;
        query = query
            .gte('date_of_introduction', from.toISOString().split('T')[0])
            .lte('date_of_introduction', to.toISOString().split('T')[0]);
    }

    if (cosponsorFilter) {
        const [min, max] = cosponsorFilter.value;
        query = query
            .gte('num_cosponsors', min)
            .lte('num_cosponsors', max);
    }

    return query;
}


type Cursor = { sortValue: string | number; id: string };

// Each sort option's `key` must be a valid Supabase column on house_bills, so
// passing it through to .order() / .or() is safe (no untrusted strings).
async function queryBills(
    filters: SearchModalFilter<string>[],
    sort: SearchModalSortOption,
    cursorStr: string | null,
): Promise<PaginatedQueryResult<Bill>> {
    const baseQuery = supabase
        .from('house_bills')
        .select('id, legislation_number, title, sponsor, party_of_sponsor, category, url, latest_action, latest_tracker_stage, date_of_introduction');

    const ascending = sort.direction === 'asc';
    // Tiebreaker on id (ordered the same direction as primary) gives a total order,
    let query = buildFilteredBillsQuery(filters, baseQuery)
        .order(sort.key, { ascending })
        .order('id', { ascending });

    if (cursorStr) {
        const cursor: Cursor = JSON.parse(cursorStr);
        const op = ascending ? 'gt' : 'lt';
        query = query.or(
            `${sort.key}.${op}.${cursor.sortValue},and(${sort.key}.eq.${cursor.sortValue},id.${op}.${cursor.id})`
        );
    }

    query = query.limit(PAGE_SIZE);

    const { data, error } = await query;
    if (error) throw error;

    const items = data ?? [];

    // build the next cursor from the last row of this page
    let nextCursor: string | null = null;
    if (items.length === PAGE_SIZE) {
        const last = items[items.length - 1] as unknown as Record<string, string | number>;
        nextCursor = JSON.stringify({
            sortValue: last[sort.key],
            id: String(last.id),
        } satisfies Cursor);
    }
    return { items, nextCursor };
}

async function countBills(filters: SearchModalFilter<string>[]): Promise<number> {
    const baseQuery = supabase
        .from('house_bills')
        .select('*', { count: 'exact', head: true });

    const query = buildFilteredBillsQuery(filters, baseQuery);
    const { count, error } = await query;
    if (error) throw error;
    return count ?? 0;
}

// Virtualized bill list using BillSearchResult cards
function VirtualizedBillList({ bills, onNeedMore }: { bills: Bill[]; onNeedMore?: () => void }) {
    const parentRef = useRef<HTMLDivElement>(null);

    const virtualizer = useVirtualizer({
        count: bills.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 160,
        overscan: 5,
    });

    // guard/trigger for 
    const hasFired = useRef(false);
    useEffect(() => {
        // Reset trigger whenever the list grows/shrinks — the next page-end visit can fire again
        // eslint-disable-next-line react-hooks/exhaustive-deps
        hasFired.current = false;
    }, [bills.length]);

    const virtualItems = virtualizer.getVirtualItems();
    const maxVisibleIndex = virtualItems.length > 0
        ? virtualItems[virtualItems.length - 1].index
        : -1;

    useEffect(() => {
        if (
            onNeedMore &&
            bills.length > 0 &&
            maxVisibleIndex >= bills.length - 10 &&
            !hasFired.current
        ) {
            hasFired.current = true;
            onNeedMore();
        }
    }, [maxVisibleIndex, bills.length, onNeedMore]);

    return (
        <div
            ref={parentRef}
            className="h-[600px] overflow-auto px-4"
            style={{ contain: 'strict' }}
        >
            <div
                style={{
                    height: `${virtualizer.getTotalSize()}px`,
                    width: '100%',
                    position: 'relative',
                }}
            >
                {virtualItems.map((virtualRow) => (
                    <div
                        key={virtualRow.key}
                        ref={virtualizer.measureElement}
                        data-index={virtualRow.index}
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            transform: `translateY(${virtualRow.start}px)`,
                        }}
                    >
                        <div className="pb-3">
                            <BillSearchResult bill={bills[virtualRow.index]} compact />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default function SearchClient() {
    const [bills, setBills] = useState<Bill[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [totalCount, setTotalCount] = useState<number | null>(null);
    const modalRef = useRef<SearchModalHandle>(null);

    const wrappedQueryFn = useCallback(async (
        filters: SearchModalFilter<string>[],
        sort: SearchModalSortOption,
        cursor: string | null,
    ): Promise<PaginatedQueryResult<Bill>> => {
        // Only show the top-level "Searching..." indicator on first-page fetches —
        // pagination requests append silently below the existing list.
        if (cursor === null) setIsLoading(true);
        const results = await queryBills(filters, sort, cursor);
        if (cursor === null) setIsLoading(false);
        return results;
    }, []);

    const wrappedCountFn = useCallback(async (filters: SearchModalFilter<string>[]): Promise<number> => {
        return countBills(filters);
    }, []);

    const handleResults = useCallback((results: Bill[], append: boolean) => {
        setBills(prev => append ? [...prev, ...results] : results);
    }, []);

    return (
        <>
            <SearchModal
                ref={modalRef}
                filters={billFilters}
                sortOptions={billSortOptions}
                queryFn={wrappedQueryFn}
                countQueryFn={wrappedCountFn}
                setResults={handleResults}
                setTotalCount={setTotalCount}
            />

            {/* Results */}
            <div className="mt-6">
                {isLoading && (
                    <p className="text-xs font-mono uppercase tracking-widest text-light mb-3">
                        Searching...
                    </p>
                )}

                {!isLoading && bills.length > 0 && (
                    <>
                        <p className="text-xs font-mono uppercase tracking-widest text-light mb-3">
                            {totalCount === null
                                ? `${bills.length} bills`
                                : `${bills.length} of ${totalCount} bills`}
                        </p>
                        <VirtualizedBillList
                            bills={bills}
                            onNeedMore={() => modalRef.current?.loadNextPage()}
                        />
                    </>
                )}

                {!isLoading && bills.length === 0 && (
                    <p className="text-sm text-light">
                        No bills match your current filters.
                    </p>
                )}
            </div>
        </>
    );
}

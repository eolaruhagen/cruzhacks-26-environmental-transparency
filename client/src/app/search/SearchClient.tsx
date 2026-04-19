'use client';

import { useCallback, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { supabase } from '@/lib/supabase';
import { Bill, BillType } from '@/lib/types';
import { SearchModal, type SearchModalFilter, type DiscreteFilter, type TextFilter, type DateRangeFilter, type RangeFilter } from '@/components/search/SearchModal';
import { BillSearchResult } from '@/components/search/SearchResultItem';

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
        label: 'Search',
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

// Strip PostgREST filter metacharacters to prevent filter injection
function sanitizeFilterInput(input: string): string {
    return input.replace(/[(),."'\\]/g, '')
}

// Query function — reads filter state, builds Supabase query, returns bills
async function queryBills(filters: SearchModalFilter<string>[]): Promise<Bill[]> {
    // Extract each filter's value by key, narrowing via discriminant
    // Extract each filter's value by key, narrowing via discriminant
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

    // Don't query if no filters active
    const hasDiscreteFilters = selectedCategories.size > 0 || selectedStatuses.size > 0 || selectedParties.size > 0;
    if (!hasDiscreteFilters && !searchQuery) {
        return [];
    }

    let query = supabase
        .from('house_bills')
        .select('id, legislation_number, title, sponsor, party_of_sponsor, category, url, latest_action, latest_tracker_stage, date_of_introduction')
        .order('date_of_introduction', { ascending: false });

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

    // Date range filter — uses gte/lte on date_of_introduction
    if (dateFilter) {
        const [from, to] = dateFilter.value;
        query = query
            .gte('date_of_introduction', from.toISOString().split('T')[0])
            .lte('date_of_introduction', to.toISOString().split('T')[0]);
    }

    // Cosponsor count range filter
    if (cosponsorFilter) {
        const [min, max] = cosponsorFilter.value;
        query = query
            .gte('num_cosponsors', min)
            .lte('num_cosponsors', max);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
}

// Virtualized bill list using BillSearchResult cards
function VirtualizedBillList({ bills }: { bills: Bill[] }) {
    const parentRef = useRef<HTMLDivElement>(null);

    const virtualizer = useVirtualizer({
        count: bills.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 160,
        overscan: 5,
    });

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
                {virtualizer.getVirtualItems().map((virtualRow) => (
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
    const [hasSearched, setHasSearched] = useState(false);

    const wrappedQueryFn = useCallback(async (filters: SearchModalFilter<string>[]) => {
        // Check if any filters are actually active
        const hasActiveFilters = filters.some(f =>
            (f.type === 'discrete' && f.selected.size > 0) ||
            (f.type === 'text' && f.value.trim() !== '')
        );

        if (!hasActiveFilters) {
            setHasSearched(false);
            setIsLoading(false);
            return [];
        }

        setIsLoading(true);
        setHasSearched(true);
        const results = await queryBills(filters);
        setIsLoading(false);
        return results;
    }, []);

    const handleResults = useCallback((results: Bill[]) => {
        setBills(results);
    }, []);

    return (
        <>
            <SearchModal
                filters={billFilters}
                queryFn={wrappedQueryFn}
                setResults={handleResults}
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
                            Showing {bills.length} bills
                        </p>
                        <VirtualizedBillList bills={bills} />
                    </>
                )}

                {!isLoading && bills.length === 0 && (
                    <p className="text-sm text-light">
                        {hasSearched
                            ? 'No bills match your current filters.'
                            : 'Select a category or enter a search term to find bills.'}
                    </p>
                )}
            </div>
        </>
    );
}

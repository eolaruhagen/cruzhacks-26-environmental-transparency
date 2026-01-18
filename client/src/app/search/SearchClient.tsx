'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { supabase } from '@/lib/supabase';

// Filter tab types
type FilterTab = 'category' | 'status' | 'party';

// The 8 environmental policy categories from the database
const BILL_TYPES = [
    { id: 'air_and_atmosphere', label: 'Air & Atmosphere' },
    { id: 'water_resources', label: 'Water Resources' },
    { id: 'waste_and_toxics', label: 'Waste & Toxics' },
    { id: 'energy_and_resources', label: 'Energy & Resources' },
    { id: 'land_and_conservation', label: 'Land & Conservation' },
    { id: 'disaster_and_emergency', label: 'Disaster & Emergency' },
    { id: 'climate_and_emissions', label: 'Climate & Emissions' },
    { id: 'justice_and_environment', label: 'Justice & Environment' },
];

// Bill status options based on latest_tracker_stage
const BILL_STATUSES = [
    { id: 'Introduced', label: 'Introduced' },
    { id: 'Passed House', label: 'Passed House' },
    { id: 'Passed Senate', label: 'Passed Senate' },
    { id: 'To President', label: 'To President' },
    { id: 'Became Law', label: 'Became Law' },
];

// Party affiliation options
const PARTY_OPTIONS = [
    { id: 'Democrat', label: 'Democrat' },
    { id: 'Republican', label: 'Republican' },
];

interface Bill {
    id: string;
    legislation_number: string;
    title: string;
    sponsor: string;
    party_of_sponsor: string;
    category: string;
    url: string;
    latest_action: string;
    latest_tracker_stage: string;
    date_of_introduction: string;
}

// Individual Bill Card component for better performance
const BillCard = React.memo(function BillCard({ bill }: { bill: Bill }) {
    const getPartyColor = (party: string) => {
        if (party.toLowerCase().includes('democrat')) return 'text-blue-600';
        if (party.toLowerCase().includes('republican')) return 'text-red-600';
        return 'text-gray-600';
    };

    return (
        <a
            href={bill.url || '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="block p-5 bg-card rounded-xl hover:bg-card-hover transition-all duration-200 group"
        >
            <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                    {/* Bill Number & Category */}
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className="text-sm font-mono font-semibold text-accent">
                            {bill.legislation_number}
                        </span>
                        {bill.category && (
                            <span className="text-xs bg-accent/10 text-accent px-2 py-0.5 rounded-full">
                                {BILL_TYPES.find(t => t.id === bill.category)?.label || bill.category}
                            </span>
                        )}
                        {bill.latest_tracker_stage && (
                            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                                {bill.latest_tracker_stage}
                            </span>
                        )}
                    </div>

                    {/* Title */}
                    <h3 className="font-semibold text-main mb-2 line-clamp-2 group-hover:text-accent transition-colors">
                        {bill.title || 'Untitled Bill'}
                    </h3>

                    {/* Sponsor */}
                    <p className="text-sm text-light">
                        <span className="font-medium">Sponsor:</span>{' '}
                        <span className={getPartyColor(bill.party_of_sponsor)}>
                            {bill.sponsor}
                        </span>
                        {bill.party_of_sponsor && (
                            <span className="text-light/70"> ({bill.party_of_sponsor})</span>
                        )}
                    </p>

                    {/* Latest Action */}
                    {bill.latest_action && (
                        <p className="text-sm text-light/80 mt-1 line-clamp-1">
                            <span className="font-medium">Latest:</span> {bill.latest_action}
                        </p>
                    )}
                </div>

                {/* Arrow */}
                <svg
                    className="w-5 h-5 text-light group-hover:text-accent group-hover:translate-x-1 transition-all shrink-0 mt-1"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
            </div>
        </a>
    );
});

// Virtualized Bill List component
function VirtualizedBillList({ bills }: { bills: Bill[] }) {
    const parentRef = useRef<HTMLDivElement>(null);

    const virtualizer = useVirtualizer({
        count: bills.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 160, // Estimated height of each bill card
        overscan: 5, // Number of items to render outside visible area
    });

    return (
        <div
            ref={parentRef}
            className="h-[600px] overflow-auto rounded-xl"
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
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            transform: `translateY(${virtualRow.start}px)`,
                        }}
                    >
                        <div className="pb-4">
                            <BillCard bill={bills[virtualRow.index]} />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default function SearchClient() {
    const [isExpanded, setIsExpanded] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState<FilterTab>('category');
    const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
    const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(new Set());
    const [selectedParties, setSelectedParties] = useState<Set<string>>(new Set());
    const [bills, setBills] = useState<Bill[]>([]);
    const [loading, setLoading] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);
    const searchContainerRef = useRef<HTMLDivElement>(null);

    // Calculate total selected filters
    const totalSelected = selectedCategories.size + selectedStatuses.size + selectedParties.size;

    // Handle clicking outside to collapse
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
                if (totalSelected === 0 && !searchQuery) {
                    setIsExpanded(false);
                }
            }
        }

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [totalSelected, searchQuery]);

    // Fetch bills when filters change
    useEffect(() => {
        async function fetchBills() {
            if (selectedCategories.size === 0 && selectedStatuses.size === 0 && selectedParties.size === 0) {
                setBills([]);
                setHasSearched(false);
                return;
            }

            setLoading(true);
            setHasSearched(true);

            try {
                let query = supabase
                    .from('house_bills')
                    .select('id, legislation_number, title, sponsor, party_of_sponsor, category, url, latest_action, latest_tracker_stage, date_of_introduction')
                    .order('date_of_introduction', { ascending: false });

                if (selectedCategories.size > 0) {
                    query = query.in('category', Array.from(selectedCategories));
                }

                if (selectedStatuses.size > 0) {
                    query = query.in('latest_tracker_stage', Array.from(selectedStatuses));
                }

                if (selectedParties.size > 0) {
                    const partyFilters = Array.from(selectedParties).map(p => `party_of_sponsor.ilike.%${p}%`).join(',');
                    query = query.or(partyFilters);
                }

                if (searchQuery.trim()) {
                    query = query.or(`title.ilike.%${searchQuery}%,legislation_number.ilike.%${searchQuery}%,sponsor.ilike.%${searchQuery}%`);
                }

                const { data, error } = await query;

                if (error) throw error;
                setBills(data || []);
            } catch (err) {
                console.error('Error fetching bills:', err);
                setBills([]);
            } finally {
                setLoading(false);
            }
        }

        const timeoutId = setTimeout(fetchBills, 300);
        return () => clearTimeout(timeoutId);
    }, [selectedCategories, selectedStatuses, selectedParties, searchQuery]);

    // Toggle functions
    const toggleCategory = (id: string) => {
        setSelectedCategories(prev => {
            const newSet = new Set(prev);
            newSet.has(id) ? newSet.delete(id) : newSet.add(id);
            return newSet;
        });
    };

    const toggleStatus = (id: string) => {
        setSelectedStatuses(prev => {
            const newSet = new Set(prev);
            newSet.has(id) ? newSet.delete(id) : newSet.add(id);
            return newSet;
        });
    };

    const toggleParty = (id: string) => {
        setSelectedParties(prev => {
            const newSet = new Set(prev);
            newSet.has(id) ? newSet.delete(id) : newSet.add(id);
            return newSet;
        });
    };

    const selectAllForTab = () => {
        switch (activeTab) {
            case 'category':
                setSelectedCategories(new Set(BILL_TYPES.map(t => t.id)));
                break;
            case 'status':
                setSelectedStatuses(new Set(BILL_STATUSES.map(t => t.id)));
                break;
            case 'party':
                setSelectedParties(new Set(PARTY_OPTIONS.map(t => t.id)));
                break;
        }
    };

    const clearAllForTab = () => {
        switch (activeTab) {
            case 'category':
                setSelectedCategories(new Set());
                break;
            case 'status':
                setSelectedStatuses(new Set());
                break;
            case 'party':
                setSelectedParties(new Set());
                break;
        }
    };

    // Render filter options based on active tab
    const renderFilterOptions = () => {
        switch (activeTab) {
            case 'category':
                return (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {BILL_TYPES.map((type) => (
                            <button
                                key={type.id}
                                onClick={() => toggleCategory(type.id)}
                                className={`
                  flex items-center justify-center px-4 py-3 rounded-xl
                  font-medium text-sm transition-all duration-200
                  ${selectedCategories.has(type.id)
                                        ? 'bg-accent text-white shadow-md scale-[1.02]'
                                        : 'bg-main/50 text-main hover:bg-main hover:shadow-sm'
                                    }
                `}
                            >
                                <span className="truncate">{type.label}</span>
                            </button>
                        ))}
                    </div>
                );
            case 'status':
                return (
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                        {BILL_STATUSES.map((status) => (
                            <button
                                key={status.id}
                                onClick={() => toggleStatus(status.id)}
                                className={`
                  flex items-center justify-center px-4 py-3 rounded-xl
                  font-medium text-sm transition-all duration-200
                  ${selectedStatuses.has(status.id)
                                        ? 'bg-accent text-white shadow-md scale-[1.02]'
                                        : 'bg-main/50 text-main hover:bg-main hover:shadow-sm'
                                    }
                `}
                            >
                                <span className="truncate">{status.label}</span>
                            </button>
                        ))}
                    </div>
                );
            case 'party':
                return (
                    <div className="grid grid-cols-2 gap-3 max-w-md mx-auto">
                        {PARTY_OPTIONS.map((party) => (
                            <button
                                key={party.id}
                                onClick={() => toggleParty(party.id)}
                                className={`
                  flex items-center justify-center px-6 py-4 rounded-xl
                  font-semibold text-base transition-all duration-200
                  ${selectedParties.has(party.id)
                                        ? party.id === 'Democrat'
                                            ? 'bg-blue-600 text-white shadow-md scale-[1.02]'
                                            : 'bg-red-600 text-white shadow-md scale-[1.02]'
                                        : 'bg-main/50 text-main hover:bg-main hover:shadow-sm'
                                    }
                `}
                            >
                                {party.label}
                            </button>
                        ))}
                    </div>
                );
        }
    };

    return (
        <>
            {/* Search Container */}
            <div
                ref={searchContainerRef}
                className={`
          bg-card rounded-2xl shadow-lg overflow-hidden
          transition-all duration-300 ease-in-out
          ${isExpanded ? 'shadow-xl' : 'shadow-md hover:shadow-lg'}
        `}
            >
                {/* Search Bar */}
                <div
                    className={`
            flex items-center gap-4 px-6 cursor-text
            transition-all duration-300
            ${isExpanded ? 'py-5' : 'py-6'}
          `}
                    onClick={() => setIsExpanded(true)}
                >
                    <svg
                        className={`
              shrink-0 text-accent transition-all duration-300
              ${isExpanded ? 'w-6 h-6' : 'w-8 h-8'}
            `}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>

                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder={isExpanded ? "Search by title, bill number, or sponsor..." : "Click to search environmental bills..."}
                        className={`
              flex-1 bg-transparent border-none outline-none
              text-main placeholder:text-light/60
              transition-all duration-300
              ${isExpanded ? 'text-lg' : 'text-xl font-medium'}
            `}
                        onFocus={() => setIsExpanded(true)}
                    />

                    {totalSelected > 0 && (
                        <span className="bg-accent text-white px-3 py-1 rounded-full text-sm font-medium">
                            {totalSelected} filter{totalSelected !== 1 ? 's' : ''}
                        </span>
                    )}

                    <svg
                        className={`
              w-5 h-5 text-light transition-transform duration-300
              ${isExpanded ? 'rotate-180' : ''}
            `}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                </div>

                {/* Expanded Filter Panel */}
                <div
                    className={`
            overflow-hidden transition-all duration-300 ease-in-out
            ${isExpanded ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'}
          `}
                >
                    <div className="border-t border-border/50 px-6 py-5">
                        {/* Filter Tab Buttons */}
                        <div className="flex gap-2 mb-5">
                            <button
                                onClick={() => setActiveTab('category')}
                                className={`
                  flex-1 px-4 py-3 rounded-xl font-semibold text-sm transition-all duration-200
                  ${activeTab === 'category'
                                        ? 'bg-accent text-white shadow-md'
                                        : 'bg-main/30 text-main hover:bg-main/50'
                                    }
                `}
                            >
                                Category
                                {selectedCategories.size > 0 && (
                                    <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${activeTab === 'category' ? 'bg-white/20' : 'bg-accent/20 text-accent'}`}>
                                        {selectedCategories.size}
                                    </span>
                                )}
                            </button>
                            <button
                                onClick={() => setActiveTab('status')}
                                className={`
                  flex-1 px-4 py-3 rounded-xl font-semibold text-sm transition-all duration-200
                  ${activeTab === 'status'
                                        ? 'bg-accent text-white shadow-md'
                                        : 'bg-main/30 text-main hover:bg-main/50'
                                    }
                `}
                            >
                                Status
                                {selectedStatuses.size > 0 && (
                                    <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${activeTab === 'status' ? 'bg-white/20' : 'bg-accent/20 text-accent'}`}>
                                        {selectedStatuses.size}
                                    </span>
                                )}
                            </button>
                            <button
                                onClick={() => setActiveTab('party')}
                                className={`
                  flex-1 px-4 py-3 rounded-xl font-semibold text-sm transition-all duration-200
                  ${activeTab === 'party'
                                        ? 'bg-accent text-white shadow-md'
                                        : 'bg-main/30 text-main hover:bg-main/50'
                                    }
                `}
                            >
                                Party Affiliation
                                {selectedParties.size > 0 && (
                                    <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${activeTab === 'party' ? 'bg-white/20' : 'bg-accent/20 text-accent'}`}>
                                        {selectedParties.size}
                                    </span>
                                )}
                            </button>
                        </div>

                        {/* Select All / Clear All */}
                        <div className="flex items-center justify-end gap-3 mb-4">
                            <button
                                onClick={selectAllForTab}
                                className="text-sm text-accent hover:text-accent-dark transition-colors font-medium"
                            >
                                Select All
                            </button>
                            <span className="text-light">|</span>
                            <button
                                onClick={clearAllForTab}
                                className="text-sm text-accent hover:text-accent-dark transition-colors font-medium"
                            >
                                Clear
                            </button>
                        </div>

                        {/* Filter Options */}
                        {renderFilterOptions()}
                    </div>
                </div>
            </div>

            {/* Results Section */}
            <div className="mt-8">
                {/* Loading State */}
                {loading && (
                    <div className="text-center py-12">
                        <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-accent border-r-transparent"></div>
                        <p className="mt-4 text-light">Searching bills...</p>
                    </div>
                )}

                {/* No Selection State */}
                {!loading && !hasSearched && (
                    <div className="text-center py-12 text-light">
                        <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <p className="text-lg">Select filters to view bills</p>
                    </div>
                )}

                {/* Empty Results */}
                {!loading && hasSearched && bills.length === 0 && (
                    <div className="text-center py-12 text-light">
                        <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <p className="text-lg">No bills found matching your criteria</p>
                    </div>
                )}

                {/* Results Count */}
                {!loading && hasSearched && bills.length > 0 && (
                    <div className="mb-4">
                        <p className="text-light">
                            Showing <span className="font-semibold text-main">{bills.length}</span> bills
                            <span className="text-sm ml-2">(virtualized for performance)</span>
                        </p>
                    </div>
                )}

                {/* Virtualized Bills List */}
                {!loading && bills.length > 0 && (
                    <VirtualizedBillList bills={bills} />
                )}
            </div>
        </>
    );
}

'use client'

import { useState } from 'react'
import { SearchModal, type SearchModalFilter } from '@/components/search/SearchModal'
import { SearchCardShell, BillSearchResult, ArticleSearchResult } from '@/components/search/SearchResultItem'
import type { BillSearchResultProps, ArticleSearchResultProps } from '@/components/search/SearchResultItem'

// --- Test data ---

const testBill: BillSearchResultProps = {
    bill: {
        id: '1',
        legislation_number: 'H.R. 1234',
        title: 'To amend the Clean Air Act to reduce greenhouse gas emissions from power plants',
        sponsor: 'Rep. Johnson, Maria',
        party_of_sponsor: 'Democrat',
        category: 'climate_and_emissions',
        url: 'https://congress.gov',
        latest_action: 'Referred to the Senate Committee on Environment and Public Works',
        latest_tracker_stage: 'Passed House',
        date_of_introduction: '2026-03-15',
    }
}

const testArticle: ArticleSearchResultProps = {
    article: {
        id: '2',
        url: 'https://reuters.com',
        source_icon_url: 'https://www.google.com/s2/favicons?domain=reuters.com&sz=32',
        published_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        title: 'EPA Announces New Water Quality Standards Affecting 12 States',
        description: 'Stricter water quality standards unveiled.',
        source: 'Reuters',
        author: ['John Doe', 'Jane Smith'],
        topics: ['Water Resources', 'EPA'],
        summary: 'The Environmental Protection Agency unveiled stricter water quality standards that will require states to update their monitoring infrastructure by 2028.',
        environmental_topic: 'water_resources',
        impact_level: 'national',
        sentiment: -0.5,
        key_quote: 'These new standards represent the most significant update to federal water quality regulations in over a decade.',
        associated_bills: null,
        associated_representatives: ['Rep. Johnson, Maria'],
    }
}

// --- Test page ---

export default function TestPage() {
    // Discrete filter state
    const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set())
    const [selectedStatus, setSelectedStatus] = useState<Set<string>>(new Set())
    // Range filter state
    const [yearRange, setYearRange] = useState<[number, number]>([2020, 2026])
    // Text filter state
    const [keyword, setKeyword] = useState('')
    // Date range filter state
    const [dateRange, setDateRange] = useState<[Date, Date]>([new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), new Date()])



    const toggleCategory = (id: string) => {
        setSelectedCategories(prev => {
            const next = new Set(prev)
            next.has(id) ? next.delete(id) : next.add(id)
            return next
        })
    }

    const toggleStatus = (id: string) => {
        setSelectedStatus(prev => {
            const next = new Set(prev)
            next.has(id) ? next.delete(id) : next.add(id)
            return next
        })
    }

    const filters: SearchModalFilter<string>[] = [
        {
            type: 'text',
            key: 'keyword',
            label: 'Search',
            value: keyword,
            placeholder: 'Search by title, bill number, or keyword...',
            onChange: setKeyword,
        },
        {
            type: 'discrete',
            key: 'category',
            label: 'Category',
            options: [
                { id: 'air_and_atmosphere', label: 'Air & Atmosphere' },
                { id: 'water_resources', label: 'Water Resources' },
                { id: 'climate_and_emissions', label: 'Climate & Emissions' },
                { id: 'energy_and_resources', label: 'Energy & Resources' },
                { id: 'land_and_conservation', label: 'Land & Conservation' },
                { id: 'waste_and_toxics', label: 'Waste & Toxics' },
            ],
            selected: selectedCategories,
            toggle: toggleCategory,
        },
        {
            type: 'discrete',
            key: 'status',
            label: 'Status',
            options: [
                { id: 'Introduced', label: 'Introduced' },
                { id: 'Passed House', label: 'Passed House' },
                { id: 'Passed Senate', label: 'Passed Senate' },
                { id: 'Became Law', label: 'Became Law' },
            ],
            selected: selectedStatus,
            toggle: toggleStatus,
        },
        {
            type: 'range',
            key: 'year',
            label: 'Year Range',
            min: 2015,
            max: 2026,
            value: yearRange,
            onChange: setYearRange,
        },
        {
            type: 'date-range',
            key: 'date-range',
            label: 'Date Range',
            value: dateRange,
            onChange: setDateRange,
        }
    ]

    return (
        <div className="w-full flex flex-col items-center pt-8 px-4">
            <div className="w-full max-w-3xl space-y-6">
                {/* Header */}
                <div>
                    <p className="wf-label mb-2">Component Test</p>
                    <h1 className="text-3xl font-bold">Search Modal &amp; Cards</h1>
                    <p className="text-light mt-1">Testing the restyled search components.</p>
                </div>

                {/* Search Modal */}
                <SearchModal
                    filters={filters}
                    sortOptions={[{ key: 'date', label: 'Newest first', direction: 'desc' }]}
                    queryFn={async () => []}
                    setResults={() => { }}
                />

                {/* Divider */}
                <div className="wf-divider" />

                {/* Result Cards */}
                <div>
                    <p className="wf-label mb-4">Result Cards</p>
                    <div className="flex flex-col gap-3">
                        <BillSearchResult {...testBill} />

                        <ArticleSearchResult {...testArticle} />

                        {/* Minimal card shell */}
                        <SearchCardShell
                            title="Minimal card with just a title and one badge"
                            badges={[{ label: 'Energy & Resources', className: 'text-accent border-accent' }]}
                            metadata={[]}
                        />
                    </div>
                </div>
            </div>
        </div>
    )
}

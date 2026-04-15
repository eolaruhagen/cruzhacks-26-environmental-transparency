import { SearchCardShell, BillSearchResult, ArticleSearchResult } from "@/components/search/SearchResultItem"
import type { ArticleSearchResultProps, ResultItemBadge as ResultItemBadgeType } from "@/components/search/SearchResultItem"
import type { BillSearchResultProps } from "@/components/search/SearchResultItem"

const testBillSearchProps: BillSearchResultProps = {
    bill: {
        id: '1',
        legislation_number: 'H.R. 1234',
        title: 'To amend the Clean Air Act to reduce greenhouse gas emissions from power plants and establish a carbon pricing mechanism',
        sponsor: 'Rep. Johnson, Maria',
        party_of_sponsor: 'Democrat',
        category: 'Climate & Emissions',
        url: 'https://www.google.com',
        latest_action: 'Referred to the Senate Committee on Environment and Public Works',
        latest_tracker_stage: 'Passed House',
        date_of_introduction: 'Mar 15, 2026',
    }
}

const testArticleSearchProps: ArticleSearchResultProps = {
    article: {
        id: '1',
        url: 'https://www.google.com',
        source_icon_url: 'https://www.google.com/s2/favicons?domain=reuters.com&sz=32',
        published_at: '2 hours ago',
        title: 'EPA Announces New Water Quality Standards Affecting 12 States',
        description: 'The Environmental Protection Agency unveiled stricter water quality standards that will require states to update their monitoring infrastructure by 2028.',
        source: 'Reuters',
        author: ['John Doe', 'Jane Smith'],
        topics: ['Water Resources', 'Environmental Protection'],
        summary: 'The Environmental Protection Agency unveiled stricter water quality standards that will require states to update their monitoring infrastructure by 2028. The article argues that this bill is nothing but pure 21st century bureaucratic overreach.',
        environmental_topic: 'Water Resources',
        impact_level: 'national',
        sentiment: -0.5,
        key_quote: 'The Environmental Protection Agency unveiled stricter water quality standards that will require states to update their monitoring infrastructure by 2028.',
        associated_bills: [
            { legislation_number: 'H.R. 2924 (118)', reason: 'Addresses water quality monitoring methods that define the scope of the EPA standards.' },
            { legislation_number: 'H.R. 8551 (117)', reason: 'Addresses water quality monitoring methods that define the scope of the EPA standards.' },
            { legislation_number: 'S. 228 (112)', reason: 'Something something' }
        ],
        associated_representatives: ['Rep. Johnson, Maria', 'Rep. Smith, John'],
    }
}

export default function SearchPage() {
    return (
        <div className="w-full flex flex-col items-center pt-4 px-4">
            <h1 className="text-3xl font-bold mb-6">Card Shell Tests</h1>

            <div className="w-full max-w-3xl flex flex-col gap-8">
                {/* Test 1: Bill-style card (mimics existing SearchClient BillCard) */}
                <SearchCardShell
                    alias="H.R. 1234"
                    title="To amend the Clean Air Act to reduce greenhouse gas emissions from power plants and establish a carbon pricing mechanism"
                    date="Mar 15, 2026"
                    badges={[
                        { label: "Climate & Emissions", className: "bg-accent/10 text-accent" },
                        { label: "Passed House", className: "bg-blue-100 text-blue-700" },
                    ]}
                    metadata={[
                        { label: "Sponsor", value: "Rep. Johnson, Maria (D-CA)" },
                        { label: "Latest", value: "Referred to the Senate Committee on Environment and Public Works", clamp: true },
                    ]}
                />


                <BillSearchResult {...testBillSearchProps} />
                <ArticleSearchResult {...testArticleSearchProps} />
                {/* Test 2: News article card */}
                <SearchCardShell
                    title="EPA Announces New Water Quality Standards Affecting 12 States"
                    sourceIconUrl="https://www.google.com/s2/favicons?domain=reuters.com&sz=32"
                    date="2 hours ago"
                    badges={[
                        { label: "Reuters", className: "bg-card-hover text-main" },
                        { label: "Water Resources", className: "bg-accent/10 text-accent" },
                        { label: "National", className: "bg-purple-100 text-purple-700" },
                    ]}
                    metadata={[
                        { label: "Summary", value: "The Environmental Protection Agency unveiled stricter water quality standards that will require states to update their monitoring infrastructure by 2028.", clamp: true },
                    ]}
                />
            </div>
        </div>
    )
}

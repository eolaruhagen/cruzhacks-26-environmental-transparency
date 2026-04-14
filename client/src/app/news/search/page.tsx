import { SearchCardShell, BillSearchResult } from "@/components/search/SearchResultItem"
import type { ResultItemBadge as ResultItemBadgeType } from "@/components/search/SearchResultItem"
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

export default function SearchPage() {
    return (
        <div className="w-full flex flex-col items-center pt-4 px-4">
            <h1 className="text-3xl font-bold mb-6">Card Shell Tests</h1>

            <div className="w-full max-w-2xl space-y-4">
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

                {/* Test 3: Minimal card (just title + one badge) */}
                <SearchCardShell
                    title="Short simple card with minimal info"
                    badges={[
                        { label: "Energy & Resources", className: "bg-accent/10 text-accent" },
                    ]}
                    metadata={[]}
                />

                {/* Test 4: Overflow badges test */}
                <SearchCardShell
                    alias="S. 5678"
                    title="A bill with many badges to test horizontal scrolling behavior"
                    badges={[
                        { label: "Air & Atmosphere", className: "bg-accent/10 text-accent" },
                        { label: "Introduced", className: "bg-blue-100 text-blue-700" },
                        { label: "Bipartisan", className: "bg-green-100 text-green-700" },
                        { label: "Committee Review", className: "bg-yellow-100 text-yellow-700" },
                        { label: "Priority", className: "bg-red-100 text-red-700" },
                        { label: "super long test name that shold maybe be truncated but. idk", className: "bg-white text-blue-500" },
                        { label: "short", className: "bg-red-500 text-white" },
                        { label: "medium", className: "bg-blue-500 text-white" }
                    ]}
                    metadata={[
                        { label: "Sponsor", value: "Sen. Williams, Robert (R-TX)" },
                    ]}
                />
            </div>
        </div>
    )
}

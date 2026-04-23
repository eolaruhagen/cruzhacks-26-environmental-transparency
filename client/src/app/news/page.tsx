import { PageNavCard } from "@/components/landing/LandingPage"

export default function NewsPage() {
    return (
        <div className="w-full flex flex-col items-center pt-4">
            {/* step one center div, text at top of screen*/}
            <div className="text-center">
                <h1 className="text-3xl font-bold text-main">U.S. Environmental News</h1>
                <p className="text-light font-mono text-sm">Stay updated on the latest environmental news and legislation.</p>
            </div>
            {/* News Nav Cards to subsections (search, visualizations, etc.) */}
            <div className="space-y-4 py-4">
                <PageNavCard
                    href="/news/search"
                    title="Search Bills"
                    description="Search for environmental bills by state, keyword, and more."
                    icon={<svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>}
                />
                <PageNavCard
                    href="/news/visualize"
                    title="Events Visualizations"
                    description="View and create custom visualizations from our rich dataset and API."
                    icon={<svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>}
                />
            </div>
        </div>
    )
}
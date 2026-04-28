import Link from 'next/link'
import {
    BentoFeatureCard,
    BentoImageCard,
    type BentoFeatureItem,
    type BentoImageItem,
} from '@/components/landing/LandingPage'
import MovingLeafBg from '@/components/threejs/MovingLeafBg'


// ─── Tracking: live data tools, top of the page, prominent ────────
const TRACKING: BentoFeatureItem[] = [
    {
        href: '/representatives',
        title: 'Find Your Representatives',
        description: 'Look up your Senators and House members by state. See photos, party, and bills they sponsor.',
        iconPath: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z',
    },
    {
        href: '/graph',
        title: 'Policy Radar',
        description: 'Interactive visualizations showing environmental legislation trends across policy areas.',
        iconPath: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
    },
    {
        href: '/climate-impact',
        title: 'Climate Data',
        description: 'Track US air quality, water quality, and climate metrics against EPA standards.',
        iconPath: 'M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    },
    {
        href: '/search',
        title: 'Search Bills',
        description: 'Filter environmental legislation by category, sponsor, status, date, and cosponsor count.',
        iconPath: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z',
    },
    {
        href: '/news',
        title: 'Environmental News',
        description: 'Coming soon!',
        iconPath: 'M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v12a2 2 0 01-2 2zM9 9h6v6H9V9z',
    },
]


// ─── Learn: background reading, lower on the page, lighter weight ────────
const LEARN: BentoImageItem[] = [
    {
        href: '/legislative-process',
        caption: 'Explore the Legislative Process',
        src: '/images/USHouse-photo.avif',
        alt: 'Interior of the US House of Representatives chamber',
    },
    {
        href: '/environmental-protection',
        caption: 'A Brief History of US Environmental Protection',
        src: '/images/Yosemite.jpg',
        alt: 'Yosemite Valley with granite cliffs and evergreen forest',
    },
    {
        href: '/executive-branch',
        caption: 'How Our Executive Branch Affect the Environment',
        src: '/images/executivecab.jpg',
        alt: 'Executive cabinet meeting',
    },
]

export default function Home() {
    return (
        <>
            {/* Background: fills the entire scroll region, sits at z-index -10 */}
            <MovingLeafBg />

            <main className="relative">
                {/* ─── Hero ──────────────────────────────────────── */}
                <section className="min-h-[calc(75vh-4rem)] flex items-center justify-center px-4 py-16">
                    <div className="wf-glass max-w-2xl w-full">
                        <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-main mb-4 leading-tight">
                            Track  <span className="text-accent underline">every</span> environmental bill in Congress
                        </h1>
                        <p className="text-base md:text-lg text-light leading-relaxed mb-8 max-w-xl">
                            EcoGlass follows environmental legislation moving through the U.S. Congress,
                            makes it searchable, and shows you how your representatives are voting.
                        </p>

                        <div className="flex flex-col sm:flex-row gap-3 mb-10">
                            <Link href="/representatives" className="wf-btn-active text-center">
                                Find My Representatives
                            </Link>
                            <Link href="/search" className="wf-btn text-center">
                                Search Bills
                            </Link>
                        </div>
                    </div>
                </section>

                {/* ─── Tracking ──────────────────────────────────── */}
                <section className="px-4 pb-32">
                    <div className="max-w-5xl mx-auto">
                        <div className="wf-glass mb-10">
                            <p className="wf-label text-accent mb-3">Tracking</p>
                            <h2 className="text-3xl md:text-4xl font-bold text-main mb-3 leading-tight">
                                Pick a tool to dig into the data.
                            </h2>
                            <p className="text-base md:text-lg text-light leading-relaxed max-w-xl">
                                Live, pulled from Congress.gov, the EPA, and other public sources.
                            </p>
                        </div>

                        {/* Row 1: two large primary cards (3 + 3 of 6 cols) */}
                        {/* Row 2: three medium cards (2 + 2 + 2 of 6 cols) */}
                        <div className="grid grid-cols-1 md:grid-cols-6 gap-6 md:gap-8">
                            <BentoFeatureCard
                                feature={TRACKING[0]}
                                prominent
                                spanClass="md:col-span-3 md:min-h-[220px]"
                            />
                            <BentoFeatureCard
                                feature={TRACKING[1]}
                                prominent
                                spanClass="md:col-span-3 md:min-h-[220px]"
                            />
                            <BentoFeatureCard
                                feature={TRACKING[2]}
                                prominent
                                spanClass="md:col-span-2 md:min-h-[180px]"
                            />
                            <BentoFeatureCard
                                feature={TRACKING[3]}
                                prominent
                                spanClass="md:col-span-2 md:min-h-[180px]"
                            />
                            <BentoFeatureCard
                                feature={TRACKING[4]}
                                prominent
                                spanClass="md:col-span-2 md:min-h-[180px]"
                            />
                        </div>
                    </div>
                </section>

                {/* ─── Learn ─────────────────────────────────────── */}
                <section className="px-4 pb-24">
                    <div className="max-w-5xl mx-auto">
                        <div className="mb-6 px-1">
                            <p className="wf-label mb-1 opacity-70">Background</p>
                            <h2 className="text-xl md:text-2xl font-semibold text-main mb-1">
                                Jump in through a subject.
                            </h2>
                            <p className="text-sm text-light leading-relaxed max-w-lg opacity-80">
                                The institutions that write the rules and the places those rules affect.
                            </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {LEARN.map((item) => (
                                <BentoImageCard key={item.href} item={item} compact />
                            ))}
                        </div>
                    </div>
                </section>
            </main>
        </>
    )
}

import Link from 'next/link'
import { IsometricThreeBackground } from '@/components/IsometricThreeBackground'
import {
    BentoFeatureCard,
    BentoImageCard,
    type BentoFeatureItem,
    type BentoImageItem,
} from '@/components/landing/LandingPage'


const FEATURES: BentoFeatureItem[] = [
    {
        href: '/my_rep',
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
        href: '/legislative-process',
        title: 'How Congress Works',
        description: 'A plain-language guide to the US legislative process and executive rulemaking.',
        iconPath: 'M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z',
    },
    {
        href: '/news',
        title: 'Environmental News',
        description: 'Coming soon!',
        iconPath: 'M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v12a2 2 0 01-2 2zM9 9h6v6H9V9z',
    },
]


const BENTO_ITEMS: BentoImageItem[] = [
    {
        href: '/legislative-process',
        caption: 'Legislative Process',
        src: '/images/USHouse-photo.avif',
        alt: 'Interior of the US House of Representatives chamber',
    },
    {
        href: '/environmental-protection',
        caption: 'Environmental Protection',
        src: '/images/Yosemite.jpg',
        alt: 'Yosemite Valley with granite cliffs and evergreen forest',
    },
    {
        href: '/executive-branch',
        caption: 'Executive Actions',
        src: '/images/executivecab.jpg',
        alt: 'Executive cabinet meeting',
    },
    {
        href: '/climate-impact',
        caption: 'Climate Impact',
        src: '/images/Florida-Keys.jpg',
        alt: 'Aerial view of the Florida Keys and surrounding water',
    },
]

export default function Home() {
    return (
        <>
            {/* Background: fills the entire scroll region, sits at z-index -10 */}
            <IsometricThreeBackground />

            <main className="relative">
                {/* ─── Hero ──────────────────────────────────────── */}
                <section className="min-h-[calc(75vh-4rem)] flex items-center justify-center px-4 py-16">
                    <div className="wf-glass max-w-2xl w-full">
                        <p className="wf-label text-accent mb-3">Environmental Transparency</p>
                        <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-main mb-4 leading-tight">
                            Track every environmental bill in <span className="text-accent">Congress</span>.
                        </h1>
                        <p className="text-base md:text-lg text-light leading-relaxed mb-8 max-w-xl">
                            EcoGlass follows environmental legislation moving through the U.S. Congress,
                            makes it searchable, and shows you how your representatives are voting.
                        </p>

                        <div className="flex flex-col sm:flex-row gap-3 mb-10">
                            <Link href="/my_rep" className="wf-btn-active text-center">
                                Find My Representatives
                            </Link>
                            <Link href="/search" className="wf-btn text-center">
                                Search Bills
                            </Link>
                        </div>

                        <a
                            href="#tools"
                            className="wf-label inline-flex items-center gap-2 opacity-70 hover:opacity-100 transition-opacity"
                        >
                            Explore <span aria-hidden="true">↓</span>
                        </a>
                    </div>
                </section>

                <div className="max-w-5xl mx-auto px-4" id="tools">
                    <div className="flex items-center gap-4 mb-6">
                        <span className="wf-label text-accent">01 / Explore</span>
                        <span className="flex-1 wf-divider" />
                    </div>
                </div>

                <section className="px-4 pb-16">
                    <div className="max-w-5xl mx-auto">
                        <div className="wf-glass mb-6">
                            <p className="wf-label text-accent mb-2">The Platform</p>
                            <h2 className="text-2xl md:text-3xl font-bold text-main">
                                Tools and topics, side by side
                            </h2>
                            <p className="text-sm text-light leading-relaxed mt-2 max-w-xl">
                                Pick a tool to dig into the data, or jump in through a subject —
                                the institutions that write the rules and the places those rules affect.
                            </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 md:auto-rows-[200px]">
                            {/* Row 1: wide image → feature → feature */}
                            <BentoImageCard item={BENTO_ITEMS[0]} spanClass="md:col-span-2 md:row-span-1" />
                            <BentoFeatureCard feature={FEATURES[0]} spanClass="md:col-span-1 md:row-span-1" />
                            <BentoFeatureCard feature={FEATURES[1]} spanClass="md:col-span-1 md:row-span-1" />

                            {/* Row 2: tall image → wide feature → feature */}
                            <BentoImageCard item={BENTO_ITEMS[1]} spanClass="md:col-span-1 md:row-span-2" />
                            <BentoFeatureCard feature={FEATURES[3]} spanClass="md:col-span-2 md:row-span-1" />
                            <BentoFeatureCard feature={FEATURES[5]} spanClass="md:col-span-1 md:row-span-1" />

                            {/* Row 3 (partial under tall): image → wide image */}
                            <BentoImageCard item={BENTO_ITEMS[2]} spanClass="md:col-span-1 md:row-span-1" />
                            <BentoImageCard item={BENTO_ITEMS[3]} spanClass="md:col-span-2 md:row-span-1" />

                            {/* Row 4: feature → wide feature */}
                            <BentoFeatureCard feature={FEATURES[2]} spanClass="md:col-span-2 md:row-span-1" />
                            <BentoFeatureCard feature={FEATURES[4]} spanClass="md:col-span-2 md:row-span-1" />
                        </div>
                    </div>
                </section>

                <div className="max-w-5xl mx-auto px-4" id="start">
                    <div className="flex items-center gap-4 mb-6">
                        <span className="wf-label text-accent">02 / Start</span>
                        <span className="flex-1 wf-divider" />
                    </div>
                </div>

                <section className="px-4 pb-24">
                    <div className="max-w-5xl mx-auto">
                        <div className="wf-glass text-center">
                            <p className="wf-label text-accent mb-3">Ready?</p>
                            <h2 className="text-2xl md:text-3xl font-bold text-main mb-3">
                                See what your representatives have been up to.
                            </h2>
                            <p className="text-sm md:text-base text-light leading-relaxed mb-6 max-w-xl mx-auto">
                                Enter your state, pull up your senators and House members,
                                and browse the environmental bills they have sponsored or cosponsored.
                            </p>
                            <div className="flex flex-col sm:flex-row gap-3 justify-center">
                                <Link href="/my_rep" className="wf-btn-active text-center">
                                    Find My Representatives
                                </Link>
                                <Link href="/news" className="wf-btn text-center">
                                    Read the News Feed
                                </Link>
                            </div>
                            <p className="wf-label text-center mt-8 opacity-70">
                                Data from Congress.gov &middot; Built for transparency
                            </p>
                        </div>
                    </div>
                </section>
            </main>
        </>
    )
}


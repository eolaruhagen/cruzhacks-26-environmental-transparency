import React from 'react'
import LandingImages from '@/components/LandingImages'

export default function Home() {
  return (
    <main className="min-h-screen">
      <div className="flex min-h-screen">
        {/* Left Side - Content (40%) */}
        <section className="w-[40%] bg-main p-8 pt-20 overflow-y-auto">
          <div className="max-w-md mx-auto">



            {/* Hero */}
            <h1 className="text-4xl lg:text-5xl font-bold leading-tight mb-4 text-main">
              Environmental
              <br />
              <span className="text-accent">Transparency</span>
            </h1>

            <p className="text-lg leading-relaxed mb-6 text-light">
              Our mission is the make environmental policy more transparent and accessible to the public. <br /><br />
              EcoTransparency is a tool that allows you to view how your own congressional representatives are voting on environmental legislation,
              as well as a look into how the whole legislative process works in the US Congress.

            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 mb-10">
              <a
                href="/my_rep"
                className="px-6 py-3 bg-accent text-white rounded-xl font-semibold hover:bg-accent-dark transition-all duration-200 shadow-lg hover:shadow-xl text-center"
              >
                Find My Representatives
              </a>
              <a
                href="/legislative-process"
                className="px-6 py-3 bg-card text-main rounded-xl font-semibold hover:bg-card-hover transition-all duration-200 text-center"
              >
                How It Works
              </a>
            </div>

            {/* Divider */}
            <div className="border-t border-border mb-8"></div>

            {/* Features Section */}
            <h2 className="text-sm font-semibold uppercase tracking-wider text-accent mb-5">
              What You Can Do
            </h2>

            <div className="space-y-5">
              {/* Feature 1 */}
              <a href="/my_rep" className="block p-4 rounded-xl bg-card hover:bg-card-hover transition-all duration-200 group">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-accent/20 flex items-center justify-center shrink-0 group-hover:bg-accent/30 transition-colors">
                    <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-main mb-1">Find Your Representatives</h3>
                    <p className="text-sm text-light leading-relaxed">
                      Look up your Senators and House members by state. See their photos, party, and contact info.
                    </p>
                  </div>
                </div>
              </a>

              {/* Feature - Climate Data */}
              <a href="/climate-impact" className="block p-4 rounded-xl bg-card hover:bg-card-hover transition-all duration-200 group">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-accent/20 flex items-center justify-center shrink-0 group-hover:bg-accent/30 transition-colors">
                    <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-main mb-1">View Climate Data</h3>
                    <p className="text-sm text-light leading-relaxed">
                      Track US air quality, water quality, and climate metrics against EPA standards and Paris Agreement goals.
                    </p>
                  </div>
                </div>
              </a>

              {/* Feature 2 */}
              <a href="/graph" className="block p-4 rounded-xl bg-card hover:bg-card-hover transition-all duration-200 group">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-accent/20 flex items-center justify-center shrink-0 group-hover:bg-accent/30 transition-colors">
                    <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-main mb-1">Visualize Legislation</h3>
                    <p className="text-sm text-light leading-relaxed">
                      Interactive charts and visualizations showing environmental legislation trends and relations between
                      areas of climate policy.
                    </p>
                  </div>
                </div>
              </a>

              {/* Feature 3 */}
              <a href="/news" className="block p-4 rounded-xl bg-card hover:bg-card-hover transition-all duration-200 group">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-accent/20 flex items-center justify-center shrink-0 group-hover:bg-accent/30 transition-colors">
                    <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-main mb-1">Learn About the US Congress</h3>
                    <p className="text-sm text-light leading-relaxed">
                      Quick guides on the US legislative process and the power of the executive branch in
                      creating policy.
                    </p>
                  </div>
                </div>
              </a>

              {/* Feature 4 */}
              <a href="/search" className="block p-4 rounded-xl bg-card hover:bg-card-hover transition-all duration-200 group">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-accent/20 flex items-center justify-center shrink-0 group-hover:bg-accent/30 transition-colors">
                    <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-main mb-1">Search Bills</h3>
                    <p className="text-sm text-light leading-relaxed">
                      Find specific environmental bills using our intelligent search engine.
                    </p>
                  </div>
                </div>
              </a>
            </div>

            {/* Footer note */}
            <p className="mt-8 text-xs text-light/70 text-center">
              Data from Congress.gov
            </p>

          </div>
        </section>

        {/* Right Side - Images (60%) */}
        <LandingImages />
      </div>
    </main>
  )
}

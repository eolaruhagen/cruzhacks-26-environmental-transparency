import React from 'react'

export default function LegislativeProcessPage() {
  return (
    <main className="min-h-screen pt-24 p-8 bg-main">
      <div className="max-w-4xl mx-auto text-center">
        {/* Header */}
        <header className="mb-10">
          <div className="text-card-block inline-block mb-4">
            <h1 className="text-4xl lg:text-5xl font-bold">
              The U.S. Legislative Process
            </h1>
          </div>
          <div className="text-card-block">
            <p className="text-lg">
              The step by step guide to the US legislative process
            </p>
          </div>
        </header>

        {/* Congress Chambers - Side by Side */}
        <section className="mb-12">
          <h2 className="text-xl font-bold text-main mb-6">
            The Two Chambers of Congress
          </h2>

          <div className="grid md:grid-cols-2 gap-6">
            {/* House of Representatives */}
            <div className="bg-card rounded-2xl border border-border p-6 text-center">
              <div className="flex flex-col items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
                  <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                <h3 className="text-2xl font-bold text-main">House of Representatives</h3>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-center gap-2 text-main">
                  <span className="font-semibold text-blue-400">435</span>
                  <span>voting members</span>
                </div>

                <p className="text-main/80 leading-relaxed">
                  The "lower chamber" represents the people directly. Each state's representation is based on population,
                  with districts redrawn every 10 years after the census. Representatives serve <strong>2-year terms</strong>.
                </p>

                <div className="pt-4 border-t border-border">
                  <h4 className="font-semibold text-main mb-2">Key Powers:</h4>
                  <ul className="text-sm text-main/70 space-y-1">
                    <li>• Initiates all revenue (tax) bills</li>
                    <li>• Power to impeach federal officials</li>
                    <li>• Elects President if no Electoral College majority</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Senate */}
            <div className="bg-card rounded-2xl border border-border p-6 text-center">
              <div className="flex flex-col items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center">
                  <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" />
                  </svg>
                </div>
                <h3 className="text-2xl font-bold text-main">Senate</h3>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-center gap-2 text-main">
                  <span className="font-semibold text-red-400">100</span>
                  <span>members (2 per state)</span>
                </div>

                <p className="text-main/80 leading-relaxed">
                  The "upper chamber" provides equal representation for all states regardless of population.
                  Each state elects 2 senators who serve <strong>6-year terms</strong>, with elections staggered so
                  roughly 1/3 are elected every 2 years.
                </p>

                <div className="pt-4 border-t border-border">
                  <h4 className="font-semibold text-main mb-2">Key Powers:</h4>
                  <ul className="text-sm text-main/70 space-y-1">
                    <li>• Confirms presidential appointments</li>
                    <li>• Ratifies treaties (2/3 vote required)</li>
                    <li>• Conducts impeachment trials</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Key Difference Note */}
          <div className="mt-6 p-4 bg-accent/10 border border-accent/20 rounded-xl">
            <p className="text-main text-sm">
              <strong className="text-main">Key Difference:</strong> The House represents population (more populous states have more representatives),
              while the Senate ensures equal state representation. Both chambers must pass identical versions of a bill for it to become law.
            </p>
          </div>
        </section>

        {/* Process Steps */}
        <div className="space-y-8">
          {/* Step 1 */}
          <section className="text-card-block">
            <div className="flex flex-col items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-accent text-white flex items-center justify-center font-bold text-xl shrink-0">
                1
              </div>
              <div>
                <h2 className="text-2xl font-semibold mb-2">Bill Introduction</h2>
                <p className="leading-relaxed">
                  A bill can be introduced in either the House of Representatives or the Senate by a member of Congress.
                  The bill is assigned a number (H.R. for House bills, S. for Senate bills) and referred to the appropriate committee.
                </p>
              </div>
            </div>
          </section>

          {/* Step 2 */}
          <section className="text-card-block">
            <div className="flex flex-col items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-accent text-white flex items-center justify-center font-bold text-xl shrink-0">
                2
              </div>
              <div>
                <h2 className="text-2xl font-semibold mb-2">Committee Review</h2>
                <p className="leading-relaxed">
                  The committee studies the bill, holds hearings, and may make changes (markup).
                  Most bills die in committee. If approved, the bill is reported to the full chamber with a written report.
                </p>
              </div>
            </div>
          </section>

          {/* Step 3 */}
          <section className="text-card-block">
            <div className="flex flex-col items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-accent text-white flex items-center justify-center font-bold text-xl shrink-0">
                3
              </div>
              <div>
                <h2 className="text-2xl font-semibold mb-2">Floor Debate & Vote</h2>
                <p className="leading-relaxed">
                  The bill is debated on the floor of the House or Senate. Members may propose amendments.
                  After debate, the chamber votes. A simple majority is needed to pass.
                </p>
              </div>
            </div>
          </section>

          {/* Step 4 */}
          <section className="text-card-block">
            <div className="flex flex-col items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-accent text-white flex items-center justify-center font-bold text-xl shrink-0">
                4
              </div>
              <div>
                <h2 className="text-2xl font-semibold mb-2">Other Chamber</h2>
                <p className="leading-relaxed">
                  If the bill passes, it goes to the other chamber where the process repeats.
                  If that chamber passes a different version, a conference committee works out the differences.
                </p>
              </div>
            </div>
          </section>

          {/* Step 5 */}
          <section className="text-card-block">
            <div className="flex flex-col items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-accent text-white flex items-center justify-center font-bold text-xl shrink-0">
                5
              </div>
              <div>
                <h2 className="text-2xl font-semibold mb-2">Presidential Action</h2>
                <p className="leading-relaxed">
                  Once both chambers pass identical versions, the bill goes to the President.
                  The President can sign it into law, veto it, or take no action.
                  Congress can override a veto with a two-thirds vote in both chambers.
                </p>
              </div>
            </div>
          </section>

          {/* Step 6 */}
          <section className="text-card-block">
            <div className="flex flex-col items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-accent-dark text-white flex items-center justify-center font-bold text-xl shrink-0">
                ✓
              </div>
              <div>
                <h2 className="text-2xl font-semibold mb-2">Becomes Law</h2>
                <p className="leading-relaxed">
                  Once signed by the President or if Congress overrides a veto, the bill becomes law.
                  It is assigned a public law number and published in the United States Statutes at Large.
                </p>
              </div>
            </div>
          </section>
        </div>

        {/* Environmental Focus */}
        <section className="mt-12 text-card-block">
          <h2 className="text-2xl font-semibold mb-4">
            Environmental Legislation
          </h2>
          <p className="leading-relaxed mb-4">
            Environmental bills typically go through the House Natural Resources Committee or the Senate
            Environment and Public Works Committee. Major environmental laws like the Clean Air Act,
            Clean Water Act, and Endangered Species Act followed this process.
          </p>
          <a
            href="/my_rep"
            className="inline-block px-6 py-3 bg-accent text-white rounded-xl font-semibold hover:bg-accent-dark transition-all duration-200 shadow-lg hover:shadow-xl"
          >
            View Your Representatives
          </a>
        </section>

        {/* Back Link */}
        <div className="mt-8">
          <a
            href="/"
            className="text-accent hover:text-accent-dark font-medium transition-colors"
          >
            ← Back to Home
          </a>
        </div>
      </div>
    </main>
  )
}

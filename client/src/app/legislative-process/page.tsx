import React from 'react'

export default function LegislativeProcessPage() {
  return (
    <main className="min-h-screen pt-24 p-8 bg-main">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <header className="mb-12">
          <div className="text-card-block inline-block mb-4">
            <h1 className="text-4xl lg:text-5xl font-bold">
              The U.S. Legislative Process
            </h1>
          </div>
          <div className="text-card-block">
            <p className="text-lg">
              Understanding how laws are made in the United States Congress
            </p>
          </div>
        </header>

        {/* Process Steps */}
        <div className="space-y-8">
          {/* Step 1 */}
          <section className="text-card-block">
            <div className="flex items-start gap-4">
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
            <div className="flex items-start gap-4">
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
            <div className="flex items-start gap-4">
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
            <div className="flex items-start gap-4">
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
            <div className="flex items-start gap-4">
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
            <div className="flex items-start gap-4">
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
            🌿 Environmental Legislation
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

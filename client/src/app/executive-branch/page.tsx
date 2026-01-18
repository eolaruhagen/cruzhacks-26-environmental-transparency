import React from 'react'

export default function ExecutiveBranchPage() {
  return (
    <main className="min-h-screen pt-24 p-8 bg-main">
      <div className="max-w-4xl mx-auto">
        
        {/* Header */}
        <header className="mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-accent/10 rounded-full text-accent text-sm font-medium mb-4">
            U.S. Government
          </div>
          <h1 className="text-4xl lg:text-5xl font-bold text-main mb-4">
            The Executive Branch & Legislation
          </h1>
          <p className="text-lg text-main/80 leading-relaxed">
            Understanding how the President and executive agencies shape, implement, and enforce the laws that govern our nation.
          </p>
        </header>

        {/* Introduction */}
        <section className="mb-12 bg-white rounded-2xl border border-gray-200 p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">The Executive Branch: Beyond Just the President</h2>
          <p className="text-gray-700 leading-relaxed mb-4">
            While Congress writes the laws, the executive branch brings them to life. Headed by the President, 
            the executive branch includes 15 cabinet departments, dozens of independent agencies, and over 
            4 million federal employees who implement and enforce legislation daily.
          </p>
          <p className="text-gray-700 leading-relaxed mb-4">
            The President's power over legislation extends far beyond simply signing or vetoing bills. Through 
            executive orders, agency appointments, regulatory decisions, and budget proposals, the executive 
            branch profoundly shapes which laws are prioritized, how they're interpreted, and whether they're 
            effectively enforced.
          </p>
          <p className="text-gray-700 leading-relaxed">
            For environmental policy specifically, agencies like the EPA, Department of Interior, and Department 
            of Energy have enormous discretion in setting standards, issuing permits, and pursuing enforcement—making 
            the executive branch the frontline of environmental protection.
          </p>
        </section>

        {/* President's Legislative Powers */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-main mb-6">
            The President's Role in Legislation
          </h2>
          
          <div className="space-y-6">
            <div className="bg-card rounded-xl p-6 border-l-4 border-accent">
              <h3 className="font-semibold text-main text-lg mb-2">Signing Bills into Law</h3>
              <p className="text-main/80 leading-relaxed">
                When Congress passes a bill, it goes to the President's desk. The President has 10 days 
                (excluding Sundays) to sign it into law, veto it, or take no action. If signed, the bill 
                becomes law immediately. The President may also issue a <strong>signing statement</strong> 
                explaining their interpretation of the law.
              </p>
            </div>

            <div className="bg-card rounded-xl p-6 border-l-4 border-accent">
              <h3 className="font-semibold text-main text-lg mb-2">The Veto Power</h3>
              <p className="text-main/80 leading-relaxed">
                The President can reject legislation by vetoing it. Congress can override a veto with a 
                two-thirds vote in both chambers—a high bar that's rarely met. The mere <em>threat</em> of 
                a veto often shapes legislation before it reaches the President's desk, giving the executive 
                significant influence over the legislative process.
              </p>
            </div>

            <div className="bg-card rounded-xl p-6 border-l-4 border-accent">
              <h3 className="font-semibold text-main text-lg mb-2">Setting the Agenda</h3>
              <p className="text-main/80 leading-relaxed">
                Through the <strong>State of the Union</strong> address and other communications, the President 
                sets the national policy agenda. The administration proposes legislation, lobbies Congress, 
                and uses the "bully pulpit" to build public support for priorities. The annual <strong>budget 
                proposal</strong> is another powerful tool—it signals which programs the executive branch 
                wants to fund or cut.
              </p>
            </div>

            <div className="bg-card rounded-xl p-6 border-l-4 border-accent">
              <h3 className="font-semibold text-main text-lg mb-2">Pocket Veto</h3>
              <p className="text-main/80 leading-relaxed">
                If Congress adjourns before the President's 10-day window expires and the President hasn't 
                signed the bill, it dies automatically—a "pocket veto." Unlike a regular veto, Congress 
                cannot override a pocket veto.
              </p>
            </div>
          </div>
        </section>

        {/* Executive Orders Section */}
        <section className="mb-12 bg-card border border-border rounded-2xl p-8">
          <h2 className="text-2xl font-bold text-main mb-6">
            Executive Orders & Actions
          </h2>

          <p className="text-main/80 leading-relaxed mb-6">
            Presidents can act unilaterally through executive orders—directives that manage operations of the
            federal government. While they can't create new laws, executive orders can significantly shape
            how existing laws are implemented.
          </p>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-main/10 rounded-xl p-5">
              <h3 className="font-semibold text-main mb-2">What They Can Do</h3>
              <ul className="text-main/80 text-sm space-y-2">
                <li>• Direct agencies to prioritize certain enforcement</li>
                <li>• Create new federal programs within existing authority</li>
                <li>• Establish policies for federal contractors</li>
                <li>• Declare national emergencies</li>
                <li>• Reorganize executive branch agencies</li>
              </ul>
            </div>

            <div className="bg-main/10 rounded-xl p-5">
              <h3 className="font-semibold text-main mb-2">What They Cannot Do</h3>
              <ul className="text-main/80 text-sm space-y-2">
                <li>• Create laws that Congress hasn't authorized</li>
                <li>• Spend money not appropriated by Congress</li>
                <li>• Override constitutional rights</li>
                <li>• Prevent judicial review</li>
                <li>• Bind future administrations permanently</li>
              </ul>
            </div>
          </div>

          <div className="mt-6 p-4 bg-main/10 rounded-lg">
            <p className="text-main/80 text-sm">
              <strong>Environmental Example:</strong> Presidents have used executive orders to establish
              national monuments, set emissions targets for federal buildings, require environmental justice
              reviews, and withdraw areas from oil drilling—all without new legislation.
            </p>
          </div>
        </section>

        {/* Cabinet & Agencies */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-main mb-6">
            The Cabinet & Federal Agencies
          </h2>

          <p className="text-main/80 leading-relaxed mb-6">
            The President appoints (with Senate confirmation) the heads of 15 executive departments and 
            numerous agency leaders. These appointees implement the President's vision and have enormous 
            discretion in how laws are enforced.
          </p>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="font-bold text-gray-900 mb-2">EPA</h3>
              <p className="text-gray-600 text-sm">
                Environmental Protection Agency—sets pollution standards, issues permits, enforces 
                environmental laws, and conducts research.
              </p>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="font-bold text-gray-900 mb-2">Department of Interior</h3>
              <p className="text-gray-600 text-sm">
                Manages federal lands, national parks, and wildlife refuges. Oversees oil, gas, and 
                mineral extraction on public lands.
              </p>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="font-bold text-gray-900 mb-2">Department of Energy</h3>
              <p className="text-gray-600 text-sm">
                Oversees energy policy, nuclear security, and research into renewable energy and 
                energy efficiency technologies.
              </p>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="font-bold text-gray-900 mb-2">Department of Agriculture</h3>
              <p className="text-gray-600 text-sm">
                Manages national forests, conservation programs, and agricultural environmental 
                regulations. Oversees the Forest Service.
              </p>
            </div>
          </div>
        </section>

        {/* Regulatory Process */}
        <section className="mb-12 bg-white rounded-2xl border border-gray-200 p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">The Rulemaking Process</h2>
          
          <p className="text-gray-700 leading-relaxed mb-6">
            When Congress passes laws, they often delegate the details to agencies. The agency then creates 
            <strong> regulations</strong> (also called "rules") that have the force of law. This is where much 
            of the real policy happens.
          </p>

          <div className="space-y-4">
            <div className="flex gap-4">
              <div className="w-10 h-10 rounded-full bg-accent text-white flex items-center justify-center font-bold shrink-0">1</div>
              <div>
                <h3 className="font-semibold text-gray-900">Proposed Rule</h3>
                <p className="text-gray-600 text-sm">Agency publishes proposed rule in the Federal Register</p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="w-10 h-10 rounded-full bg-accent text-white flex items-center justify-center font-bold shrink-0">2</div>
              <div>
                <h3 className="font-semibold text-gray-900">Public Comment</h3>
                <p className="text-gray-600 text-sm">Citizens and organizations submit comments (typically 30-90 days)</p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="w-10 h-10 rounded-full bg-accent text-white flex items-center justify-center font-bold shrink-0">3</div>
              <div>
                <h3 className="font-semibold text-gray-900">Agency Review</h3>
                <p className="text-gray-600 text-sm">Agency must consider and respond to substantive comments</p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="w-10 h-10 rounded-full bg-accent text-white flex items-center justify-center font-bold shrink-0">4</div>
              <div>
                <h3 className="font-semibold text-gray-900">Final Rule</h3>
                <p className="text-gray-600 text-sm">Agency publishes final rule, which takes effect after specified date</p>
              </div>
            </div>
          </div>

          <div className="mt-6 p-4 bg-accent/10 rounded-lg">
            <p className="text-gray-700 text-sm">
              <strong>You can participate!</strong> Anyone can submit comments on proposed rules at{' '}
              <a href="https://regulations.gov" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                regulations.gov
              </a>. Your voice matters in shaping how laws are implemented.
            </p>
          </div>
        </section>

        {/* Checks & Balances */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-main mb-6">
            Checks on Executive Power
          </h2>

          <div className="grid md:grid-cols-3 gap-6">
            <div className="bg-card rounded-xl p-6 text-center">
              <h3 className="font-bold text-main mb-2">Congressional Oversight</h3>
              <p className="text-main/70 text-sm">
                Congress can hold hearings, subpoena documents, control agency budgets, and pass laws 
                overriding executive actions.
              </p>
            </div>

            <div className="bg-card rounded-xl p-6 text-center">
              <h3 className="font-bold text-main mb-2">Judicial Review</h3>
              <p className="text-main/70 text-sm">
                Courts can strike down executive orders and agency rules that exceed legal authority 
                or violate the Constitution.
              </p>
            </div>

            <div className="bg-card rounded-xl p-6 text-center">
              <h3 className="font-bold text-main mb-2">Elections</h3>
              <p className="text-main/70 text-sm">
                Every four years, voters decide whether to continue or change the executive branch's 
                direction through presidential elections.
              </p>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="mb-12 bg-white rounded-2xl border border-gray-200 p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            Why This Matters for You
          </h2>
          <p className="text-gray-700 leading-relaxed mb-6">
            The executive branch's decisions affect your daily life—from the air you breathe to the water you 
            drink. Understanding how executive power works helps you be a more informed voter and citizen. 
            The President you elect chooses the agency heads who set environmental standards, enforce laws, 
            and determine national priorities.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4">
            <a 
              href="/my_rep"
              className="px-6 py-3 bg-accent text-white rounded-xl font-semibold hover:bg-accent-dark transition-all duration-200 shadow-lg hover:shadow-xl text-center"
            >
              Find Your Representatives
            </a>
            <a 
              href="/legislative-process"
              className="px-6 py-3 bg-card text-main rounded-xl font-semibold hover:bg-card-hover transition-all duration-200 text-center"
            >
              How Bills Become Laws
            </a>
          </div>
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

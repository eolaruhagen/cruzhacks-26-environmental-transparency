import React from 'react'

export default function EnvironmentalProtectionPage() {
  return (
    <main className="min-h-screen pt-24 p-8 bg-main">
      <div className="max-w-4xl mx-auto">
        
        {/* Header */}
        <header className="mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-accent/10 rounded-full text-accent text-sm font-medium mb-4">
            Environmental Policy
          </div>
          <h1 className="text-4xl lg:text-5xl font-bold text-main mb-4">
            Environmental Protection & The Law
          </h1>
          <p className="text-lg text-main/80 leading-relaxed">
            Understanding how legislation shapes our relationship with nature and safeguards the planet for future generations.
          </p>
        </header>

        {/* Introduction */}
        <section className="mb-12 bg-card rounded-2xl border border-border p-8">
          <h2 className="text-2xl font-bold text-main mb-4">Why Environmental Law Matters</h2>
          <p className="text-main/80 leading-relaxed mb-4">
            Environmental law is the collection of regulations, statutes, and common law that governs how humans interact
            with the natural world. These laws address air and water quality, waste management, species protection,
            natural resource management, and the overall sustainability of human activities.
          </p>
          <p className="text-main/80 leading-relaxed mb-4">
            Without legal frameworks, there would be no enforceable standards to prevent pollution, protect endangered
            species, or preserve natural habitats. Environmental legislation creates accountability—it gives citizens
            the power to hold corporations and governments responsible for environmental harm.
          </p>
          <p className="text-main/80 leading-relaxed">
            The stakes couldn't be higher: climate change, biodiversity loss, and pollution threaten human health,
            economic stability, and the survival of countless species. Effective environmental law is our primary
            tool for addressing these challenges at scale.
          </p>
        </section>

        {/* History Section */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-main mb-6">
            A Brief History of U.S. Environmental Law
          </h2>
          
          <div className="space-y-6">
            <div className="bg-card rounded-xl p-6 border-l-4 border-accent">
              <h3 className="font-semibold text-main text-lg mb-2">1960s: The Awakening</h3>
              <p className="text-main/80 leading-relaxed">
                Rachel Carson's "Silent Spring" (1962) exposed the dangers of pesticides like DDT, sparking 
                public awareness. Rivers caught fire, smog choked cities, and Americans demanded change. 
                This grassroots movement laid the foundation for modern environmental legislation.
              </p>
            </div>

            <div className="bg-card rounded-xl p-6 border-l-4 border-accent">
              <h3 className="font-semibold text-main text-lg mb-2">1970: The Environmental Decade Begins</h3>
              <p className="text-main/80 leading-relaxed">
                The first Earth Day mobilized 20 million Americans. President Nixon created the 
                <strong> Environmental Protection Agency (EPA)</strong> and signed the <strong>National Environmental 
                Policy Act (NEPA)</strong>, requiring environmental impact assessments for federal projects. 
                The <strong>Clean Air Act</strong> followed, setting air quality standards.
              </p>
            </div>

            <div className="bg-card rounded-xl p-6 border-l-4 border-accent">
              <h3 className="font-semibold text-main text-lg mb-2">1972-1980: Landmark Legislation</h3>
              <p className="text-main/80 leading-relaxed">
                The <strong>Clean Water Act</strong> (1972) tackled water pollution. The <strong>Endangered Species Act</strong> (1973) 
                protected threatened wildlife. <strong>CERCLA/Superfund</strong> (1980) addressed toxic waste cleanup. 
                These laws established the federal government's role as environmental guardian.
              </p>
            </div>

            <div className="bg-card rounded-xl p-6 border-l-4 border-accent">
              <h3 className="font-semibold text-main text-lg mb-2">1990s-Present: Climate Focus</h3>
              <p className="text-main/80 leading-relaxed">
                The <strong>Clean Air Act Amendments</strong> (1990) addressed acid rain and ozone depletion. 
                Recent decades have seen growing focus on climate change, renewable energy incentives, and 
                international agreements like the Paris Climate Accord. Environmental justice—ensuring 
                pollution doesn't disproportionately harm marginalized communities—has become a key priority.
              </p>
            </div>
          </div>
        </section>

        {/* Key Laws Section */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-main mb-6">
            Landmark Environmental Laws
          </h2>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-card rounded-xl border border-border p-6">
              <h3 className="font-bold text-main text-lg mb-2">Clean Air Act (1970)</h3>
              <p className="text-main/60 text-sm mb-3">Regulates air emissions from stationary and mobile sources</p>
              <ul className="text-main/80 text-sm space-y-1">
                <li>• Sets National Ambient Air Quality Standards</li>
                <li>• Regulates hazardous air pollutants</li>
                <li>• Controls vehicle emissions</li>
                <li>• Addresses acid rain and ozone depletion</li>
              </ul>
            </div>

            <div className="bg-card rounded-xl border border-border p-6">
              <h3 className="font-bold text-main text-lg mb-2">Clean Water Act (1972)</h3>
              <p className="text-main/60 text-sm mb-3">Establishes structure for regulating pollutant discharges</p>
              <ul className="text-main/80 text-sm space-y-1">
                <li>• Sets water quality standards for surface waters</li>
                <li>• Requires permits for point source pollution</li>
                <li>• Protects wetlands</li>
                <li>• Funds wastewater treatment infrastructure</li>
              </ul>
            </div>

            <div className="bg-card rounded-xl border border-border p-6">
              <h3 className="font-bold text-main text-lg mb-2">Endangered Species Act (1973)</h3>
              <p className="text-main/60 text-sm mb-3">Protects critically imperiled species and their habitats</p>
              <ul className="text-main/80 text-sm space-y-1">
                <li>• Lists species as threatened or endangered</li>
                <li>• Designates critical habitat</li>
                <li>• Prohibits "take" of listed species</li>
                <li>• Requires federal agencies to consult on impacts</li>
              </ul>
            </div>

            <div className="bg-card rounded-xl border border-border p-6">
              <h3 className="font-bold text-main text-lg mb-2">NEPA (1970)</h3>
              <p className="text-main/60 text-sm mb-3">National Environmental Policy Act</p>
              <ul className="text-main/80 text-sm space-y-1">
                <li>• Requires Environmental Impact Statements</li>
                <li>• Mandates consideration of alternatives</li>
                <li>• Ensures public participation</li>
                <li>• Applies to all major federal actions</li>
              </ul>
            </div>
          </div>
        </section>

        {/* How Laws Protect */}
        <section className="mb-12 bg-card border border-border rounded-2xl p-8">
          <h2 className="text-2xl font-bold text-main mb-6">How Environmental Laws Actually Protect Us</h2>

          <div className="space-y-6">
            <div className="flex gap-4">
              <div className="w-12 h-12 rounded-full bg-accent text-white flex items-center justify-center font-bold text-lg shrink-0">1</div>
              <div>
                <h3 className="font-semibold text-main mb-1">Setting Standards</h3>
                <p className="text-main/80">
                  Laws establish measurable limits on pollution—how much lead in drinking water, particulate matter in air,
                  or chemicals in rivers. Without standards, there's no way to define "too much."
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="w-12 h-12 rounded-full bg-accent text-white flex items-center justify-center font-bold text-lg shrink-0">2</div>
              <div>
                <h3 className="font-semibold text-main mb-1">Requiring Permits</h3>
                <p className="text-main/80">
                  Companies must obtain permits before discharging pollutants. This creates a paper trail,
                  allows public comment, and gives regulators oversight over industrial activities.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="w-12 h-12 rounded-full bg-accent text-white flex items-center justify-center font-bold text-lg shrink-0">3</div>
              <div>
                <h3 className="font-semibold text-main mb-1">Enforcement & Penalties</h3>
                <p className="text-main/80">
                  Laws have teeth—violators face fines, cleanup costs, and even criminal prosecution.
                  The threat of enforcement incentivizes compliance.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="w-12 h-12 rounded-full bg-accent text-white flex items-center justify-center font-bold text-lg shrink-0">4</div>
              <div>
                <h3 className="font-semibold text-main mb-1">Citizen Suits</h3>
                <p className="text-main/80">
                  Many environmental laws allow citizens to sue polluters or government agencies that fail to enforce the law.
                  This democratizes environmental protection and holds everyone accountable.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Your Role Section */}
        <section className="mb-12 bg-card rounded-2xl border border-border p-8">
          <h2 className="text-2xl font-bold text-main mb-4">
            Your Role in Environmental Protection
          </h2>
          <p className="text-main/80 leading-relaxed mb-6">
            Environmental laws only work if they're enforced—and enforcement depends on political will.
            Your representatives in Congress vote on environmental legislation, confirm EPA administrators,
            and control the agency's budget. <strong>Knowing how your representatives vote on environmental
            issues is the first step to holding them accountable.</strong>
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
              Learn the Legislative Process
            </a>
          </div>
        </section>

        {/* Quote */}
        <section className="mb-12 text-center">
          <blockquote className="text-2xl font-medium text-main/80 italic leading-relaxed max-w-2xl mx-auto">
            "The environment is where we all meet; where we all have a mutual interest; it is the one thing all of us share."
          </blockquote>
          <cite className="text-accent font-semibold mt-4 block">— Lady Bird Johnson</cite>
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

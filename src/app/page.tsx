export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-emerald-950 via-slate-900 to-cyan-950">
      <div className="container mx-auto px-6 py-24">
        <header className="mb-16">
          <div className="inline-block px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 mb-6">
            <span className="text-emerald-400 text-sm font-medium tracking-wide">
              CruzHacks 2026
            </span>
          </div>
          <h1 className="text-6xl md:text-7xl font-bold text-white mb-6 leading-tight">
            Environmental
            <br />
            <span className="bg-gradient-to-r from-emerald-400 via-cyan-400 to-teal-400 bg-clip-text text-transparent">
              Transparency
            </span>
          </h1>
          <p className="text-xl text-slate-400 max-w-2xl leading-relaxed">
            Building a more transparent future through data-driven environmental insights.
          </p>
        </header>

        <section className="grid md:grid-cols-3 gap-6">
          <div className="group p-8 rounded-2xl bg-white/5 border border-white/10 hover:border-emerald-500/30 transition-all duration-300 hover:bg-white/[0.07]">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center mb-6">
              <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-white mb-3">Data Visualization</h3>
            <p className="text-slate-400 leading-relaxed">
              Interactive charts and maps to explore environmental data in real-time.
            </p>
          </div>

          <div className="group p-8 rounded-2xl bg-white/5 border border-white/10 hover:border-cyan-500/30 transition-all duration-300 hover:bg-white/[0.07]">
            <div className="w-12 h-12 rounded-xl bg-cyan-500/20 flex items-center justify-center mb-6">
              <svg className="w-6 h-6 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-white mb-3">Transparency Tools</h3>
            <p className="text-slate-400 leading-relaxed">
              Research and verify environmental claims with our verification toolkit.
            </p>
          </div>

          <div className="group p-8 rounded-2xl bg-white/5 border border-white/10 hover:border-teal-500/30 transition-all duration-300 hover:bg-white/[0.07]">
            <div className="w-12 h-12 rounded-xl bg-teal-500/20 flex items-center justify-center mb-6">
              <svg className="w-6 h-6 text-teal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-white mb-3">Community Driven</h3>
            <p className="text-slate-400 leading-relaxed">
              Join a community committed to environmental accountability and action.
            </p>
          </div>
        </section>

        <footer className="mt-24 pt-8 border-t border-white/10">
          <p className="text-slate-500 text-sm">
            Built with Next.js, React & Vercel
          </p>
        </footer>
      </div>
    </main>
  )
}

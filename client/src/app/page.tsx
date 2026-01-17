export default function Home() {
  return (
    <main className="min-h-screen">
      <div className="max-w-6xl mx-auto px-6 py-16">
        {/* Hero Section */}
        <section className="text-center mb-20">
          <div className="inline-block px-4 py-2 rounded-full bg-[#4A8F58]/20 border border-[#4A8F58]/30 mb-6">
            <span className="text-[#2D5A3B] text-sm font-medium tracking-wide">
              🌱 CruzHacks 2026
            </span>
          </div>
          
          <h1 className="text-5xl md:text-6xl font-bold text-[#2D5A3B] mb-6 leading-tight">
            Environmental
            <br />
            <span className="text-[#4A8F58]">Transparency</span>
          </h1>
          
          <p className="text-xl text-[#4A6B4F] max-w-2xl mx-auto leading-relaxed mb-10">
            Empowering communities with data-driven insights into environmental policies and their real-world impact.
          </p>

          <div className="flex flex-wrap justify-center gap-4">
            <a 
              href="/graph" 
              className="px-8 py-4 bg-[#4A8F58] text-white rounded-xl font-semibold hover:bg-[#3D7A4A] transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-105"
            >
              Explore Data
            </a>
            <a 
              href="/news" 
              className="px-8 py-4 bg-white/60 text-[#2D5A3B] rounded-xl font-semibold border-2 border-[#4A8F58]/30 hover:bg-white hover:border-[#4A8F58] transition-all duration-200"
            >
              Latest News
            </a>
          </div>
        </section>

        {/* Features Grid */}
        <section className="grid md:grid-cols-3 gap-8 mb-20">
          <div className="p-8 rounded-2xl bg-white/50 border border-[#4A8F58]/20 hover:border-[#4A8F58]/40 transition-all duration-300 hover:shadow-lg group">
            <div className="w-14 h-14 rounded-xl bg-[#A8D5BA] flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              <svg className="w-7 h-7 text-[#2D5A3B]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-[#2D5A3B] mb-3">Interactive Graphs</h3>
            <p className="text-[#4A6B4F] leading-relaxed">
              Visualize environmental data with customizable charts and real-time filtering options.
            </p>
          </div>

          <div className="p-8 rounded-2xl bg-white/50 border border-[#4A8F58]/20 hover:border-[#4A8F58]/40 transition-all duration-300 hover:shadow-lg group">
            <div className="w-14 h-14 rounded-xl bg-[#B5E0C3] flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              <svg className="w-7 h-7 text-[#2D5A3B]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-[#2D5A3B] mb-3">Legislation News</h3>
            <p className="text-[#4A6B4F] leading-relaxed">
              Stay informed with the latest environmental legislation updates and policy changes.
            </p>
          </div>

          <div className="p-8 rounded-2xl bg-white/50 border border-[#4A8F58]/20 hover:border-[#4A8F58]/40 transition-all duration-300 hover:shadow-lg group">
            <div className="w-14 h-14 rounded-xl bg-[#C2E8D0] flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              <svg className="w-7 h-7 text-[#2D5A3B]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-[#2D5A3B] mb-3">Smart Search</h3>
            <p className="text-[#4A6B4F] leading-relaxed">
              Find specific environmental topics, policies, and data points with powerful search.
            </p>
          </div>
        </section>

        {/* Footer */}
        <footer className="text-center pt-10 border-t border-[#4A8F58]/20">
          <p className="text-[#4A6B4F] text-sm">
            Built with 💚 at CruzHacks 2026
          </p>
        </footer>
      </div>
    </main>
  )
}

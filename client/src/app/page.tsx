import React from 'react'
import Image from 'next/image'







export default function Home() {
  return (
    <main className="min-h-screen">
      <div className="flex min-h-screen">
        {/* Left Side - Content (40%) */}
        <section className="w-[40%] bg-[#5A9F68] p-8 flex flex-col">
          <div className="max-w-md mx-auto">
            {/* Hero */}
            <div className="mb-12">
              <h1 className="text-4xl lg:text-5xl font-bold text-[#2D5A3B] mb-6 leading-tight">
                Environmental
                <br />
                <span className="text-white">Transparency</span>
              </h1>
              
              <p className="text-lg text-[#E8F5E9] leading-relaxed mb-8">
                Empowering communities with data-driven insights into environmental policies and their real-world impact.
              </p>

              <div className="flex flex-col sm:flex-row gap-3">
                <a 
                  href="/graph" 
                  className="px-6 py-3 bg-[#2D5A3B] text-white rounded-xl font-semibold hover:bg-[#1E3D28] transition-all duration-200 shadow-lg hover:shadow-xl text-center"
                >
                  Explore Data
                </a>
                <a 
                  href="/news" 
                  className="px-6 py-3 bg-white/20 text-white rounded-xl font-semibold border-2 border-white/40 hover:bg-white/30 transition-all duration-200 text-center"
                >
                  Latest News
                </a>
              </div>
            </div>

            {/* Features */}
            <div className="space-y-4">
              <div className="p-5 rounded-xl bg-white/20 border border-white/30 hover:bg-white/30 transition-all duration-300 group">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-lg bg-[#A8D5BA] flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                    <svg className="w-6 h-6 text-[#2D5A3B]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-1">Interactive Graphs</h3>
                    <p className="text-[#E8F5E9] text-sm leading-relaxed">
                      Visualize environmental policy data with customizable charts.
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-5 rounded-xl bg-white/20 border border-white/30 hover:bg-white/30 transition-all duration-300 group">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-lg bg-[#B5E0C3] flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                    <svg className="w-6 h-6 text-[#2D5A3B]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-1">Legislation News</h3>
                    <p className="text-[#E8F5E9] text-sm leading-relaxed">
                      View the latest news and updates on environmental legislation.
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-5 rounded-xl bg-white/20 border border-white/30 hover:bg-white/30 transition-all duration-300 group">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-lg bg-[#C2E8D0] flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                    <svg className="w-6 h-6 text-[#2D5A3B]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-1">Smart Search</h3>
                    <p className="text-[#E8F5E9] text-sm leading-relaxed">
                      Intelligent query search engine for environmental legislation.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Right Side - Images (60%) */}
        <section className="w-[60%] flex flex-col">
          {/* Image 1 - US House */}
          <div className="relative border-b border-[#4A8F58]/40 h-auto">
            <Image
              src="/images/USHouse-photo.avif"
              alt="US House of Representatives"
              width={1200}
              height={800}
              className="w-full h-auto object-cover"
              priority
            />
          </div>

          {/* Image 2 */}
          <div className="flex-1 bg-[#D4EED9] border-b border-[#4A8F58]/40 flex items-center justify-center min-h-[300px]">
            <div className="text-center p-6">
              <div className="w-14 h-14 mx-auto mb-3 bg-[#4A8F58]/20 flex items-center justify-center">
                <svg className="w-7 h-7 text-[#4A8F58]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="text-[#4A8F58] font-medium">Image 2</p>
            </div>
          </div>

          {/* Image 3 */}
          <div className="flex-1 bg-[#C0E8CA] border-b border-[#4A8F58]/40 flex items-center justify-center min-h-[300px]">
            <div className="text-center p-6">
              <div className="w-14 h-14 mx-auto mb-3 bg-[#4A8F58]/20 flex items-center justify-center">
                <svg className="w-7 h-7 text-[#4A8F58]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="text-[#4A8F58] font-medium">Image 3</p>
            </div>
          </div>

          {/* Image 4 */}
          <div className="flex-1 bg-[#ACE2BB] flex items-center justify-center min-h-[300px]">
            <div className="text-center p-6">
              <div className="w-14 h-14 mx-auto mb-3 bg-[#4A8F58]/20 flex items-center justify-center">
                <svg className="w-7 h-7 text-[#4A8F58]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="text-[#4A8F58] font-medium">Image 4</p>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}

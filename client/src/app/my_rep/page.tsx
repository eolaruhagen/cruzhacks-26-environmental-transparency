import React from 'react'
import MyRepClient from './MyRepClient'

export default function MyRepPage() {
  return (
    <main className="min-h-screen p-8 pt-20 bg-main">
      <div className="max-w-6xl mx-auto">
        
        {/* Hero Header */}
        <header className="mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-accent/10 rounded-full text-accent text-sm font-medium mb-4">
            Civic Engagement
          </div>
          
          <h1 className="text-4xl lg:text-5xl font-bold mb-4 text-main">
            Your <span className="text-accent">Representatives</span>
          </h1>
          
          <p className="text-lg leading-relaxed text-main max-w-2xl">
            Find your elected officials in Congress and learn how they represent you on environmental issues.
          </p>
        </header>

        {/* Why This Matters Section */}
        <section className="mb-10 p-6 bg-card rounded-2xl border border-border">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            
            Why This Matters
          </h2>
          
          <div className="grid md:grid-cols-3 gap-6">
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h3 className="font-medium text-main mb-1">Accountability</h3>
                <p className="text-sm text-main/80">
                  See who represents you and hold them accountable for their environmental votes.
                </p>
              </div>
            </div>
            
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <div>
                <h3 className="font-medium text-main mb-1">Take Action</h3>
                <p className="text-sm text-main/80">
                  Contact your representatives directly about issues you care about.
                </p>
              </div>
            </div>
            
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
              <div>
                <h3 className="font-medium text-main mb-1">Stay Informed</h3>
                <p className="text-sm text-main/80">
                  Understand how decisions in Congress affect your local environment.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Interactive Client Component */}
        <MyRepClient />
      </div>
    </main>
  )
}

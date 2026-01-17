import React from 'react'
import MyRepClient from './MyRepClient'

export default function MyRepPage() {
  return (
    <main className="min-h-screen p-8 pt-24">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <header className="mb-8">
          <h1 className="text-4xl font-bold text-[#2D5A3B] mb-2">Your Representatives</h1>
          <p className="text-[#4A6B4F] text-lg">
            Track how your elected officials vote on environmental legislation.
          </p>
        </header>

        {/* Interactive Client Component */}
        <MyRepClient />
      </div>
    </main>
  )
}

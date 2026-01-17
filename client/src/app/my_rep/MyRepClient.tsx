'use client'

import React, { useState } from 'react'

type Representative = {
  name: string
  title: string
  party: string
  photoUrl: string
  state: string
  district?: string
  url?: string
  terms?: number
}

const states = [
  { code: 'AL', name: 'Alabama' }, { code: 'AK', name: 'Alaska' }, { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' }, { code: 'CA', name: 'California' }, { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' }, { code: 'DE', name: 'Delaware' }, { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' }, { code: 'HI', name: 'Hawaii' }, { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' }, { code: 'IN', name: 'Indiana' }, { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' }, { code: 'KY', name: 'Kentucky' }, { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' }, { code: 'MD', name: 'Maryland' }, { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' }, { code: 'MN', name: 'Minnesota' }, { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' }, { code: 'MT', name: 'Montana' }, { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' }, { code: 'NH', name: 'New Hampshire' }, { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' }, { code: 'NY', name: 'New York' }, { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' }, { code: 'OH', name: 'Ohio' }, { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' }, { code: 'PA', name: 'Pennsylvania' }, { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' }, { code: 'SD', name: 'South Dakota' }, { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' }, { code: 'UT', name: 'Utah' }, { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' }, { code: 'WA', name: 'Washington' }, { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' }, { code: 'WY', name: 'Wyoming' }, { code: 'DC', name: 'District of Columbia' },
]

export default function MyRepClient() {
  const [selectedState, setSelectedState] = useState('')
  const [submittedState, setSubmittedState] = useState('')
  const [stateName, setStateName] = useState('')
  const [representatives, setRepresentatives] = useState<Representative[]>([])
  const [selectedRep, setSelectedRep] = useState<Representative | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const handleStateSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (selectedState) {
      setIsLoading(true)
      setError('')
      
      try {
        const response = await fetch(`/api/representatives?state=${selectedState}`)
        const data = await response.json()
        
        if (data.error) {
          setError(data.error)
          setRepresentatives([])
        } else {
          setSubmittedState(selectedState)
          setStateName(data.state)
          setRepresentatives(data.representatives)
        }
      } catch (err) {
        setError('Failed to fetch representatives. Please try again.')
        setRepresentatives([])
      } finally {
        setIsLoading(false)
      }
    }
  }

  const handleRepClick = (rep: Representative) => {
    setSelectedRep(rep)
  }

  const handleBackToReps = () => {
    setSelectedRep(null)
  }

  const getPartyColor = (party: string) => {
    const p = party.toLowerCase()
    if (p.includes('democrat')) return 'bg-blue-100 text-blue-800 border-blue-300'
    if (p.includes('republican')) return 'bg-red-100 text-red-800 border-red-300'
    if (p.includes('independent')) return 'bg-purple-100 text-purple-800 border-purple-300'
    return 'bg-gray-100 text-gray-800 border-gray-300'
  }

  const getPartyBgColor = (party: string) => {
    const p = party.toLowerCase()
    if (p.includes('democrat')) return 'bg-blue-50'
    if (p.includes('republican')) return 'bg-red-50'
    if (p.includes('independent')) return 'bg-purple-50'
    return 'bg-gray-50'
  }

  // View: Selected Representative Details
  if (selectedRep) {
    return (
      <div>
        {/* Back Button */}
        <button
          onClick={handleBackToReps}
          className="flex items-center gap-2 text-[#4A8F58] hover:text-[#2D5A3B] font-medium mb-6 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Representatives
        </button>

        {/* Representative Card */}
        <div className="bg-white/60 rounded-2xl border border-[#4A8F58]/20 p-8 mb-6">
          <div className="flex flex-col md:flex-row gap-8">
            {/* Photo */}
            <div className="shrink-0">
              {selectedRep.photoUrl ? (
                <img
                  src={selectedRep.photoUrl}
                  alt={selectedRep.name}
                  className="w-48 h-60 rounded-xl object-cover border-2 border-[#4A8F58]/20"
                />
              ) : (
                <div className="w-48 h-60 rounded-xl bg-[#E8F5E9] flex items-center justify-center">
                  <svg className="w-20 h-20 text-[#4A8F58]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1">
              <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium mb-3 border ${getPartyColor(selectedRep.party)}`}>
                {selectedRep.party}
              </span>
              <h2 className="text-3xl font-bold text-[#2D5A3B] mb-2">{selectedRep.name}</h2>
              <p className="text-xl text-[#4A6B4F] mb-2">{selectedRep.title}</p>
              {selectedRep.district && (
                <p className="text-[#4A6B4F] mb-4">District {selectedRep.district}, {selectedRep.state}</p>
              )}
              {!selectedRep.district && (
                <p className="text-[#4A6B4F] mb-4">{selectedRep.state}</p>
              )}

              {/* Details */}
              <div className="space-y-4 mt-6">
                {selectedRep.terms && (
                  <div className="flex items-center gap-3">
                    <svg className="w-5 h-5 text-[#4A8F58]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <div>
                      <p className="text-sm font-medium text-[#2D5A3B]">Terms Served</p>
                      <p className="text-[#4A6B4F]">{selectedRep.terms} term{selectedRep.terms > 1 ? 's' : ''}</p>
                    </div>
                  </div>
                )}

                {selectedRep.url && (
                  <div className="flex items-center gap-3">
                    <svg className="w-5 h-5 text-[#4A8F58]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                    </svg>
                    <div>
                      <p className="text-sm font-medium text-[#2D5A3B]">Official Website</p>
                      <a 
                        href={selectedRep.url} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="text-[#4A8F58] hover:underline"
                      >
                        Visit Website →
                      </a>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Info Box */}
        <div className="p-6 bg-[#E8F5E9] rounded-xl border border-[#4A8F58]/20">
          <h3 className="font-semibold text-[#2D5A3B] mb-2">📊 About This Representative</h3>
          <p className="text-[#4A6B4F] text-sm leading-relaxed">
            {selectedRep.title === 'U.S. Senator' 
              ? `U.S. Senators serve 6-year terms and represent their entire state. Each state has exactly 2 Senators.`
              : `U.S. Representatives serve 2-year terms and represent a specific congressional district within their state.`
            }
          </p>
        </div>
      </div>
    )
  }

  // View: Representatives List
  if (submittedState && representatives.length > 0) {
    const senators = representatives.filter(r => r.title.includes('Senator'))
    const reps = representatives.filter(r => !r.title.includes('Senator'))

    return (
      <div>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-[#4A6B4F]">
              Showing Congress members for: <span className="font-semibold text-[#2D5A3B]">{stateName}</span>
            </p>
            <p className="text-sm text-[#4A6B4F] mt-1">
              {senators.length} Senator{senators.length !== 1 ? 's' : ''}, {reps.length} Representative{reps.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={() => {
              setSubmittedState('')
              setRepresentatives([])
              setSelectedState('')
              setStateName('')
            }}
            className="text-[#4A8F58] hover:text-[#2D5A3B] font-medium text-sm transition-colors"
          >
            Change State
          </button>
        </div>

        {/* Senators Section */}
        {senators.length > 0 && (
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-[#2D5A3B] mb-4">U.S. Senators</h3>
            <div className="grid md:grid-cols-2 gap-6">
              {senators.map((rep, index) => (
                <button
                  key={index}
                  onClick={() => handleRepClick(rep)}
                  className={`rounded-2xl border border-[#4A8F58]/20 p-6 text-left hover:shadow-lg hover:border-[#4A8F58]/40 transition-all duration-200 group ${getPartyBgColor(rep.party)}`}
                >
                  <div className="flex gap-4">
                    {/* Photo */}
                    <div className="shrink-0 w-24 h-32 rounded-xl bg-white/60 flex items-center justify-center overflow-hidden">
                      {rep.photoUrl ? (
                        <img src={rep.photoUrl} alt={rep.name} className="w-full h-full object-cover" />
                      ) : (
                        <svg className="w-12 h-12 text-[#4A8F58]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      )}
                    </div>
                    {/* Info */}
                    <div className="flex-1">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium mb-2 border ${getPartyColor(rep.party)}`}>
                        {rep.party}
                      </span>
                      <h4 className="text-lg font-semibold text-[#2D5A3B] group-hover:text-[#4A8F58] transition-colors">
                        {rep.name}
                      </h4>
                      <p className="text-[#4A6B4F] text-sm">{rep.title}</p>
                      <div className="flex items-center gap-1 mt-3 text-[#4A8F58] text-sm font-medium">
                        View Details
                        <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Representatives Section */}
        {reps.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold text-[#2D5A3B] mb-4">U.S. Representatives</h3>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {reps.map((rep, index) => (
                <button
                  key={index}
                  onClick={() => handleRepClick(rep)}
                  className={`rounded-xl border border-[#4A8F58]/20 p-4 text-left hover:shadow-lg hover:border-[#4A8F58]/40 transition-all duration-200 group ${getPartyBgColor(rep.party)}`}
                >
                  <div className="flex gap-3">
                    {/* Photo */}
                    <div className="shrink-0 w-16 h-20 rounded-lg bg-white/60 flex items-center justify-center overflow-hidden">
                      {rep.photoUrl ? (
                        <img src={rep.photoUrl} alt={rep.name} className="w-full h-full object-cover" />
                      ) : (
                        <svg className="w-8 h-8 text-[#4A8F58]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      )}
                    </div>
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium mb-1 border ${getPartyColor(rep.party)}`}>
                        {rep.party}
                      </span>
                      <h4 className="text-sm font-semibold text-[#2D5A3B] group-hover:text-[#4A8F58] transition-colors truncate">
                        {rep.name}
                      </h4>
                      <p className="text-[#4A6B4F] text-xs">
                        {rep.district ? `District ${rep.district}` : rep.title}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  // View: State Selection
  return (
    <div className="max-w-xl mx-auto text-center">
      <div className="mb-8">
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-[#E8F5E9] flex items-center justify-center">
          <svg className="w-10 h-10 text-[#4A8F58]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-[#2D5A3B] mb-3">Find Your Representatives</h2>
        <p className="text-[#4A6B4F] leading-relaxed">
          Select your state to see your U.S. Senators and House Representatives.
        </p>
      </div>

      <form onSubmit={handleStateSubmit} className="space-y-4">
        <div className="relative">
          <select
            value={selectedState}
            onChange={(e) => setSelectedState(e.target.value)}
            className="w-full px-6 py-4 text-lg bg-white/70 border-2 border-[#4A8F58]/30 rounded-xl text-[#2D5A3B] focus:outline-none focus:border-[#4A8F58] focus:bg-white transition-all duration-200 appearance-none cursor-pointer"
          >
            <option value="">Select your state...</option>
            {states.map((state) => (
              <option key={state.code} value={state.code}>
                {state.name}
              </option>
            ))}
          </select>
          <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
            <svg className="w-6 h-6 text-[#4A8F58]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        {error && (
          <p className="text-red-600 text-sm">{error}</p>
        )}

        <button
          type="submit"
          disabled={!selectedState || isLoading}
          className="w-full px-6 py-4 bg-[#4A8F58] text-white text-lg font-semibold rounded-xl hover:bg-[#3D7A4A] disabled:bg-[#4A8F58]/50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-xl"
        >
          {isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Finding Representatives...
            </span>
          ) : (
            'Find My Representatives'
          )}
        </button>
      </form>

      <p className="mt-6 text-sm text-[#4A6B4F]">
        Data provided by Congress.gov — the official source for U.S. legislative information.
      </p>
    </div>
  )
}

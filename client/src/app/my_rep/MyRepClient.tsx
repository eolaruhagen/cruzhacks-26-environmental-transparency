'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'

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

type Bill = {
  id: string
  legislation_number: string
  title: string
  url: string
  latest_action: string
  category: string
  date_of_introduction: string
}

// Types for mini radar
type RadarBill = {
  legislation_number: string
  category: string
  subcategory_scores: Record<string, number> | null
  title: string
  url: string
}

type Subcategory = {
  subcategory: string
  bill_type: string
  embedding: number[]
}

// Mini Policy Radar Component
interface MiniPolicyRadarProps {
  repName: string
}

function MiniPolicyRadar({ repName }: MiniPolicyRadarProps) {
  const [bills, setBills] = useState<RadarBill[]>([])
  const [subcategories, setSubcategories] = useState<Subcategory[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [hoveredBill, setHoveredBill] = useState<RadarBill | null>(null)
  const [selectedBill, setSelectedBill] = useState<RadarBill | null>(null)

  // Extract first and last name from representative name for searching
  const extractNames = (fullName: string): { firstName: string; lastName: string } => {
    // Handle formats like "John Smith" or "Smith, John"
    const parts = fullName.split(',')
    if (parts.length > 1) {
      // "Smith, John" format
      const lastName = parts[0].trim()
      const firstName = parts[1].trim().split(' ')[0] // Get first word after comma
      return { firstName, lastName }
    }
    // "John Smith" format
    const nameParts = fullName.split(' ')
    const firstName = nameParts[0]
    const lastName = nameParts[nameParts.length - 1]
    return { firstName, lastName }
  }

  // Fetch bills and subcategories when rep name changes
  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      const { firstName, lastName } = extractNames(repName)

      try {
        // Fetch subcategories first
        const { data: subcatData } = await supabase
          .from('categories_embeddings')
          .select('subcategory, bill_type, embedding')

        if (subcatData) {
          setSubcategories(subcatData)
          // Set initial category
          const categories = Array.from(new Set(subcatData.map(s => s.bill_type))).sort()
          if (categories.length > 0) {
            setSelectedCategory(categories[0])
          }
        }

        // Fetch sponsored bills - search for "LastName, FirstName" pattern (Congress.gov format)
        const { data: sponsored } = await supabase
          .from('house_bills')
          .select('legislation_number, category, subcategory_scores, title, url')
          .ilike('sponsor', `%${lastName}, ${firstName}%`)
          .not('subcategory_scores', 'is', null)

        // Fetch cosponsored bills - search for last name in array
        // Cosponsors array uses similar "LastName, FirstName" format
        const { data: cosponsored } = await supabase
          .from('house_bills')
          .select('legislation_number, category, subcategory_scores, title, url')
          .filter('cosponsors', 'cs', `{${lastName}}`)
          .not('subcategory_scores', 'is', null)

        // Combine and deduplicate by legislation_number
        const allBills = [...(sponsored || []), ...(cosponsored || [])]
        const uniqueBills = Array.from(
          new Map(allBills.map(b => [b.legislation_number, b])).values()
        ) as RadarBill[]

        setBills(uniqueBills)
      } catch (err) {
        console.error('Error fetching radar data:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [repName])

  // Get unique categories
  const categories = useMemo(() =>
    Array.from(new Set(subcategories.map(s => s.bill_type))).sort()
    , [subcategories])

  // Get subcategories for selected category
  const categorySubcats = useMemo(() =>
    selectedCategory
      ? subcategories.filter(s => s.bill_type === selectedCategory)
      : []
    , [subcategories, selectedCategory])

  // Filter bills by selected category
  const filteredBills = useMemo(() =>
    selectedCategory
      ? bills.filter(b => b.category === selectedCategory)
      : bills
    , [bills, selectedCategory])

  // Count bills per category
  const categoryBillCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    categories.forEach(cat => {
      counts[cat] = bills.filter(b => b.category === cat).length
    })
    return counts
  }, [bills, categories])

  // Format category name
  const formatCategoryName = (name: string): string => {
    return name
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ')
  }

  // Chart dimensions - 20% larger
  const size = 480
  const center = size / 2
  const radius = size * 0.35

  // Calculate position for a bill based on its subcategory scores
  const getPosition = (scores: Record<string, number>, subcatNames: string[]) => {
    const n = subcatNames.length
    if (n === 0) return { x: center, y: center }

    let dirX = 0, dirY = 0

    subcatNames.forEach((subcat, i) => {
      const score = scores[subcat] || 0
      const angle = (2 * Math.PI * i) / n - Math.PI / 2
      dirX += score * Math.cos(angle)
      dirY += score * Math.sin(angle)
    })

    const dirMagnitude = Math.sqrt(dirX * dirX + dirY * dirY)
    if (dirMagnitude > 0) {
      dirX /= dirMagnitude
      dirY /= dirMagnitude
    }

    // Calculate how spread out the scores are
    const scoreValues = subcatNames.map(s => scores[s] || 0)
    const maxScore = Math.max(...scoreValues)
    const minScore = Math.min(...scoreValues)
    const scoreRange = maxScore - minScore
    const normalizedSpread = Math.min(scoreRange / 0.1, 1)
    const billRadius = radius * (0.3 + normalizedSpread * 0.6)

    return {
      x: center + dirX * billRadius,
      y: center + dirY * billRadius
    }
  }

  // Empty state
  const isEmpty = bills.length === 0

  if (loading) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
        <div className="flex flex-col items-center justify-center h-64">
          <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-accent border-r-transparent"></div>
          <p className="mt-4 text-gray-600">Loading policy radar...</p>
        </div>
      </div>
    )
  }

  const subcatNames = categorySubcats.map(s => s.subcategory)

  // Background circles for the radar
  const circles = [0.25, 0.5, 0.75, 1].map((scale, i) => (
    <circle
      key={i}
      cx={center}
      cy={center}
      r={radius * scale}
      fill="none"
      stroke="var(--color-accent)"
      strokeWidth={1}
      strokeDasharray={scale === 1 ? "0" : "4,4"}
    />
  ))

  // Axis lines
  const axisLines = subcatNames.map((subcat, i) => {
    const n = subcatNames.length
    const angle = (2 * Math.PI * i) / n - Math.PI / 2
    const endX = center + radius * Math.cos(angle)
    const endY = center + radius * Math.sin(angle)

    return (
      <line
        key={`line-${subcat}`}
        x1={center}
        y1={center}
        x2={endX}
        y2={endY}
        stroke="var(--color-accent)"
        strokeWidth={1}
      />
    )
  })

  // Axis labels - using SVG text like main radar
  const axisLabels = subcatNames.map((subcat, i) => {
    const n = subcatNames.length
    const angle = (2 * Math.PI * i) / n - Math.PI / 2
    const labelDistance = radius + 40
    const labelX = center + labelDistance * Math.cos(angle)
    const labelY = center + labelDistance * Math.sin(angle)

    // Smart text anchoring based on position
    const normalizedAngle = ((angle + Math.PI / 2) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI)
    let textAnchor: 'start' | 'middle' | 'end' = 'middle'
    if (normalizedAngle > Math.PI * 0.15 && normalizedAngle < Math.PI * 0.85) {
      textAnchor = 'start'
    } else if (normalizedAngle > Math.PI * 1.15 && normalizedAngle < Math.PI * 1.85) {
      textAnchor = 'end'
    }

    const formatName = (name: string) =>
      name.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')

    return (
      <text
        key={`label-${subcat}`}
        x={labelX}
        y={labelY}
        textAnchor={textAnchor}
        dominantBaseline="middle"
        fill="var(--color-border)"
        style={{ fontSize: '11px' }}
      >
        {formatName(subcat)}
      </text>
    )
  })

  // Bill dots
  const billDots = filteredBills.map((bill, idx) => {
    if (!bill.subcategory_scores) return null
    const pos = getPosition(bill.subcategory_scores, subcatNames)
    const isHovered = hoveredBill?.legislation_number === bill.legislation_number

    return (
      <g key={bill.legislation_number}>
        <circle
          cx={pos.x}
          cy={pos.y}
          r={isHovered ? 8 : 5}
          fill="#3b82f6"
          stroke={isHovered ? '#1e40af' : 'white'}
          strokeWidth={isHovered ? 2 : 1}
          opacity={isEmpty ? 0.3 : 0.8}
          className="cursor-pointer transition-all duration-150"
          onMouseEnter={() => setHoveredBill(bill)}
          onMouseLeave={() => setHoveredBill(null)}
          onClick={() => setSelectedBill(bill)}
        />
      </g>
    )
  })

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
      <h3 className="text-xl font-bold mb-4" style={{ color: 'var(--color-border)' }}>
        Policy Radar
      </h3>

      {/* Category Boxes Grid */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        {categories.map(cat => {
          const count = categoryBillCounts[cat] || 0
          const isSelected = selectedCategory === cat
          return (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`p-3 rounded-lg border text-left transition-all duration-200 ${isSelected
                ? 'bg-accent text-white border-accent shadow-md'
                : count > 0
                  ? 'bg-gray-50 border-gray-200 hover:border-accent hover:bg-accent/5'
                  : 'bg-gray-50 border-gray-200 opacity-50'
                }`}
            >
              <p className={`text-sm font-medium truncate ${isSelected ? 'text-white' : 'text-gray-800'}`}>
                {formatCategoryName(cat)}
              </p>
              <p className={`text-lg font-bold ${isSelected ? 'text-white' : count > 0 ? 'text-accent' : 'text-gray-400'}`}>
                {count} {count === 1 ? 'bill' : 'bills'}
              </p>
            </button>
          )
        })}
      </div>

      {/* Total Stats */}
      <div className="bg-gray-50 rounded-lg p-3 mb-4 text-center">
        <p className="text-2xl font-bold text-accent">{bills.length}</p>
        <p className="text-xs text-gray-600">Total Environmental Bills</p>
      </div>

      {/* Radar Chart */}
      <div className="relative" style={{ minHeight: size + 60 }}>
        {isEmpty && (
          <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
            <div className="bg-gray-900/70 text-white px-6 py-3 rounded-xl font-semibold text-center">
              Representative is not active<br />with any environmental bills
            </div>
          </div>
        )}
        <svg
          width={size}
          height={size}
          className="mx-auto"
          style={{
            overflow: 'visible',
            filter: isEmpty ? 'grayscale(100%) opacity(0.5)' : 'none'
          }}
        >
          {circles}
          {axisLines}
          {axisLabels}
          {billDots}
        </svg>
      </div>

      {/* Hovered Bill Tooltip */}
      {hoveredBill && !selectedBill && (
        <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
          <p className="text-sm font-mono font-semibold text-accent">{hoveredBill.legislation_number}</p>
          <p className="text-sm text-gray-700 line-clamp-2">{hoveredBill.title}</p>
          <p className="text-xs text-gray-500 mt-1">Click for details</p>
        </div>
      )}

      {/* Selected Bill Detail Panel */}
      {selectedBill && (
        <div className="mt-4 p-4 bg-blue-50 rounded-xl border border-blue-200">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <span className="text-sm font-mono font-bold text-accent">{selectedBill.legislation_number}</span>
              {selectedBill.category && (
                <span className="ml-2 text-xs bg-accent/10 text-accent px-2 py-0.5 rounded-full">
                  {formatCategoryName(selectedBill.category)}
                </span>
              )}
            </div>
            <button
              onClick={() => setSelectedBill(null)}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <h4 className="font-semibold text-gray-900 mb-3">{selectedBill.title}</h4>
          <a
            href={selectedBill.url || '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg font-medium text-sm hover:bg-accent/90 transition-colors"
          >
            View on Congress.gov
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        </div>
      )}
    </div>
  )
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

  // Bills state
  const [sponsoredBills, setSponsoredBills] = useState<Bill[]>([])
  const [cosponsoredBills, setCosponsoredBills] = useState<Bill[]>([])
  const [activeBillsTab, setActiveBillsTab] = useState<'sponsored' | 'cosponsored'>('sponsored')
  const [billsLoading, setBillsLoading] = useState(false)

  // Extract last name from representative name for searching
  const extractLastName = (fullName: string): string => {
    // Handle formats like "John Smith" or "Smith, John"
    const parts = fullName.split(',')
    if (parts.length > 1) {
      return parts[0].trim() // "Smith, John" -> "Smith"
    }
    const nameParts = fullName.split(' ')
    return nameParts[nameParts.length - 1] // "John Smith" -> "Smith"
  }

  // Fetch bills when a representative is selected
  useEffect(() => {
    async function fetchBills() {
      if (!selectedRep) {
        setSponsoredBills([])
        setCosponsoredBills([])
        return
      }

      setBillsLoading(true)
      const lastName = extractLastName(selectedRep.name)

      try {
        // Fetch sponsored bills - search sponsor field for last name
        const { data: sponsored } = await supabase
          .from('house_bills')
          .select('id, legislation_number, title, url, latest_action, category, date_of_introduction')
          .ilike('sponsor', `%${lastName}%`)
          .order('date_of_introduction', { ascending: false })
          .limit(25)

        setSponsoredBills(sponsored || [])

        // Fetch cosponsored bills - search in cosponsors array
        // Using text search since cosponsors is a text array
        const { data: cosponsored } = await supabase
          .from('house_bills')
          .select('id, legislation_number, title, url, latest_action, category, date_of_introduction')
          .filter('cosponsors', 'cs', `{${lastName}}`)
          .order('date_of_introduction', { ascending: false })
          .limit(25)

        // If array contains doesn't work, try text search approach
        if (!cosponsored || cosponsored.length === 0) {
          const { data: cosponsoredAlt } = await supabase
            .from('house_bills')
            .select('id, legislation_number, title, url, latest_action, category, date_of_introduction')
            .or(`cosponsors.cs.{${lastName}}`)
            .order('date_of_introduction', { ascending: false })
            .limit(25)
          setCosponsoredBills(cosponsoredAlt || [])
        } else {
          setCosponsoredBills(cosponsored || [])
        }
      } catch (err) {
        console.error('Error fetching bills:', err)
      } finally {
        setBillsLoading(false)
      }
    }

    fetchBills()
  }, [selectedRep])

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

  // High contrast party badge colors
  const getPartyBadge = (party: string) => {
    const p = party.toLowerCase()
    if (p.includes('democrat')) return 'bg-blue-600 text-white'
    if (p.includes('republican')) return 'bg-red-600 text-white'
    if (p.includes('independent')) return 'bg-purple-600 text-white'
    return 'bg-gray-600 text-white'
  }

  // Card border accent
  const getPartyBorder = (party: string) => {
    const p = party.toLowerCase()
    if (p.includes('democrat')) return 'border-l-blue-500'
    if (p.includes('republican')) return 'border-l-red-500'
    if (p.includes('independent')) return 'border-l-purple-500'
    return 'border-l-gray-500'
  }

  // View: Selected Representative Details
  if (selectedRep) {
    return (
      <div>
        {/* Back Button */}
        <button
          onClick={handleBackToReps}
          className="flex items-center gap-2 text-accent hover:text-accent-dark font-medium mb-6 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Representatives
        </button>

        {/* Representative Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 mb-6">
          <div className="flex flex-col md:flex-row gap-8">
            {/* Photo */}
            <div className="shrink-0">
              {selectedRep.photoUrl ? (
                <img
                  src={selectedRep.photoUrl}
                  alt={selectedRep.name}
                  className="w-48 h-60 rounded-xl object-cover shadow-md"
                />
              ) : (
                <div className="w-48 h-60 rounded-xl bg-gray-100 flex items-center justify-center">
                  <svg className="w-20 h-20 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1">
              <span className={`inline-block px-3 py-1 rounded-full text-sm font-semibold mb-4 ${getPartyBadge(selectedRep.party)}`}>
                {selectedRep.party}
              </span>
              <h2 className="text-3xl font-bold text-gray-900 mb-2">{selectedRep.name}</h2>
              <p className="text-xl text-gray-700 mb-2">{selectedRep.title}</p>
              {selectedRep.district && (
                <p className="text-gray-600 mb-4">District {selectedRep.district}, {selectedRep.state}</p>
              )}
              {!selectedRep.district && (
                <p className="text-gray-600 mb-4">{selectedRep.state}</p>
              )}

              {/* Details */}
              <div className="space-y-4 mt-6 pt-6 border-t border-gray-200">
                {selectedRep.terms && (
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                      <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-500">Terms Served</p>
                      <p className="text-gray-900 font-semibold">{selectedRep.terms} term{selectedRep.terms > 1 ? 's' : ''}</p>
                    </div>
                  </div>
                )}

                {selectedRep.url && (
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                      <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-500">Official Website</p>
                      <a
                        href={selectedRep.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-accent hover:text-accent-dark font-semibold"
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

        {/* Mini Policy Radar */}
        <div className="mt-6">
          <MiniPolicyRadar repName={selectedRep.name} />
        </div>

        {/* Environmental Bills Section */}
        <div className="mt-6 bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
            Environmental Legislation
          </h3>

          {/* Tabs */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setActiveBillsTab('sponsored')}
              className={`flex-1 px-4 py-3 rounded-xl font-semibold text-sm transition-all duration-200 ${activeBillsTab === 'sponsored'
                ? 'bg-accent text-white shadow-md'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
            >
              Sponsored
              {sponsoredBills.length > 0 && (
                <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${activeBillsTab === 'sponsored' ? 'bg-white/20' : 'bg-accent/20 text-accent'
                  }`}>
                  {sponsoredBills.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveBillsTab('cosponsored')}
              className={`flex-1 px-4 py-3 rounded-xl font-semibold text-sm transition-all duration-200 ${activeBillsTab === 'cosponsored'
                ? 'bg-accent text-white shadow-md'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
            >
              Cosponsored
              {cosponsoredBills.length > 0 && (
                <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${activeBillsTab === 'cosponsored' ? 'bg-white/20' : 'bg-accent/20 text-accent'
                  }`}>
                  {cosponsoredBills.length}
                </span>
              )}
            </button>
          </div>

          {/* Bills List */}
          {billsLoading ? (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-accent border-r-transparent"></div>
              <p className="mt-3 text-gray-600">Loading bills...</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {(activeBillsTab === 'sponsored' ? sponsoredBills : cosponsoredBills).length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <svg className="w-12 h-12 mx-auto mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p>No {activeBillsTab} environmental bills found</p>
                </div>
              ) : (
                (activeBillsTab === 'sponsored' ? sponsoredBills : cosponsoredBills).map((bill) => (
                  <a
                    key={bill.id}
                    href={bill.url || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-all duration-200 group"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-sm font-mono font-semibold text-accent">
                            {bill.legislation_number}
                          </span>
                          {bill.category && (
                            <span className="text-xs bg-accent/10 text-accent px-2 py-0.5 rounded-full">
                              {bill.category.replace(/_/g, ' ')}
                            </span>
                          )}
                        </div>
                        <h4 className="font-medium text-gray-900 line-clamp-2 group-hover:text-accent transition-colors">
                          {bill.title || 'Untitled Bill'}
                        </h4>
                        {bill.latest_action && (
                          <p className="text-sm text-gray-600 mt-1 line-clamp-1">
                            <span className="font-medium">Latest:</span> {bill.latest_action}
                          </p>
                        )}
                      </div>
                      <svg
                        className="w-5 h-5 text-gray-400 group-hover:text-accent group-hover:translate-x-1 transition-all shrink-0 mt-1"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </a>
                ))
              )}
            </div>
          )}
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
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8 p-4 bg-card rounded-xl border border-border">
          <div>
            <p className="text-white font-medium">
              Congress members for <span className="font-bold text-accent">{stateName}</span>
            </p>
            <p className="text-sm text-gray-400">
              {senators.length} Senator{senators.length !== 1 ? 's' : ''} • {reps.length} Representative{reps.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={() => {
              setSubmittedState('')
              setRepresentatives([])
              setSelectedState('')
              setStateName('')
            }}
            className="px-4 py-2 text-accent hover:bg-accent/10 rounded-lg font-medium text-sm transition-colors"
          >
            ← Change State
          </button>
        </div>

        {/* Senators Section */}
        {senators.length > 0 && (
          <div className="mb-10">
            <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <span className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center text-sm">🏛️</span>
              U.S. Senators
            </h3>
            <div className="grid md:grid-cols-2 gap-4">
              {senators.map((rep, index) => (
                <button
                  key={index}
                  onClick={() => handleRepClick(rep)}
                  className={`bg-card rounded-xl border border-border border-l-4 ${getPartyBorder(rep.party)} p-5 text-left hover:shadow-lg hover:border-gray-300 transition-all duration-200 group`}
                >
                  <div className="flex gap-4">
                    {/* Photo */}
                    <div className="shrink-0 w-20 h-24 rounded-lg bg-card flex items-center justify-center overflow-hidden">
                      {rep.photoUrl ? (
                        <img src={rep.photoUrl} alt={rep.name} className="w-full h-full object-cover" />
                      ) : (
                        <svg className="w-10 h-10 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      )}
                    </div>
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold mb-2 ${getPartyBadge(rep.party)}`}>
                        {rep.party}
                      </span>
                      <h4 className="text-lg font-bold text-white group-hover:text-accent transition-colors">
                        {rep.name}
                      </h4>
                      <p className="text-sm text-gray-400">{rep.title}</p>
                      <div className="flex items-center gap-1 mt-3 text-accent text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity">
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
            <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <span className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center text-sm">🏠</span>
              U.S. Representatives
            </h3>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {reps.map((rep, index) => (
                <button
                  key={index}
                  onClick={() => handleRepClick(rep)}
                  className={`bg-card rounded-xl border border-border border-l-4 ${getPartyBorder(rep.party)} p-4 text-left hover:shadow-lg hover:border-gray-300 transition-all duration-200 group`}
                >
                  <div className="flex gap-3">
                    {/* Photo */}
                    <div className="shrink-0 w-14 h-16 rounded-lg bg-card flex items-center justify-center overflow-hidden">
                      {rep.photoUrl ? (
                        <img src={rep.photoUrl} alt={rep.name} className="w-full h-full object-cover" />
                      ) : (
                        <svg className="w-7 h-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      )}
                    </div>
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold mb-1 ${getPartyBadge(rep.party)}`}>
                        {rep.party}
                      </span>
                      <h4 className="text-sm font-bold text-white group-hover:text-accent transition-colors truncate">
                        {rep.name}
                      </h4>
                      <p className="text-xs text-gray-400">
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
    <div className="max-w-lg mx-auto">
      {/* Selection Card */}
      <div className="bg-card rounded-2xl border border-border p-8 text-center">
        <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-accent/10 flex items-center justify-center">
          <svg className="w-8 h-8 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>

        <h2 className="text-2xl font-bold text-main mb-2">Select Your State</h2>
        <p className="text-main/80 mb-6">
          Choose your state to see your U.S. Senators and House Representatives.
        </p>

        <form onSubmit={handleStateSubmit} className="space-y-4">
          <div className="relative">
            <select
              value={selectedState}
              onChange={(e) => setSelectedState(e.target.value)}
              className="w-full px-5 py-4 text-lg bg-gray-800 text-gray-100 border-2 border-border rounded-xl focus:outline-none focus:border-accent transition-all duration-200 appearance-none cursor-pointer"
            >
              <option value="" className="bg-gray-800 text-gray-100">Select your state...</option>
              {states.map((state) => (
                <option key={state.code} value={state.code} className="bg-gray-800 text-gray-100">
                  {state.name}
                </option>
              ))}
            </select>
            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
              <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={!selectedState || isLoading}
            className="w-full px-6 py-4 bg-accent text-white text-lg font-semibold rounded-xl hover:bg-accent-dark disabled:bg-gray-300 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-xl"
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
      </div>

      {/* Data Source */}
      <p className="mt-6 text-center text-sm text-main/70">
        Data from <a href="https://congress.gov" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">Congress.gov</a> — the official U.S. legislative database
      </p>
    </div>
  )
}

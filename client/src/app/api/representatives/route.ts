import { NextRequest, NextResponse } from 'next/server'

export type Representative = {
  name: string
  title: string
  party: string
  photoUrl: string
  state: string
  district?: string
  url?: string
  terms?: number
}

export type RepresentativesResponse = {
  representatives: Representative[]
  state: string
  error?: string
}

// State abbreviation to full name mapping
const stateNames: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri',
  MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio',
  OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  DC: 'District of Columbia', PR: 'Puerto Rico', GU: 'Guam', VI: 'Virgin Islands',
  AS: 'American Samoa', MP: 'Northern Mariana Islands'
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const state = searchParams.get('state')?.toUpperCase()

  if (!state || !stateNames[state]) {
    return NextResponse.json(
      { error: 'Invalid state code', representatives: [], state: '' },
      { status: 400 }
    )
  }

  const apiKey = process.env.CONGRESS_API_KEY

  if (!apiKey) {
    console.error('CONGRESS_API_KEY not configured')
    return NextResponse.json(
      { error: 'API not configured', representatives: [], state: '' },
      { status: 500 }
    )
  }

  try {
    const representatives: Representative[] = []

    // Fetch current members from Congress.gov API
    // Use /v3/member/{stateCode} endpoint for state filtering
    const response = await fetch(
      `https://api.congress.gov/v3/member/${state}?currentMember=true&limit=100&api_key=${apiKey}`,
      {
        headers: {
          'Accept': 'application/json',
        },
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Congress.gov API error:', errorText)
      return NextResponse.json(
        { error: 'Failed to fetch representatives', representatives: [], state: '' },
        { status: response.status }
      )
    }

    const data = await response.json()

    if (data.members && Array.isArray(data.members)) {
      for (const member of data.members) {
        // Get the CURRENT term (last item in array, as terms are chronological)
        const termsArray = member.terms?.item || []
        const currentTerm = termsArray[termsArray.length - 1] // Last term is current
        const chamber = currentTerm?.chamber || ''
        const isSenate = chamber.toLowerCase().includes('senate')
        const isHouse = chamber.toLowerCase().includes('house')

        if (!isSenate && !isHouse) continue

        representatives.push({
          name: member.name || `${member.firstName} ${member.lastName}`,
          title: isSenate ? 'U.S. Senator' : `U.S. Representative`,
          party: member.partyName || member.party || 'Unknown',
          photoUrl: member.depiction?.imageUrl || '',
          state: stateNames[state] || state,
          district: isHouse ? (currentTerm?.district || member.district || '').toString() : undefined,
          url: member.officialWebsiteUrl || member.url || '',
          terms: termsArray.length || 1,
        })
      }
    }

    // Sort: Senators first, then Representatives by district
    representatives.sort((a, b) => {
      if (a.title.includes('Senator') && !b.title.includes('Senator')) return -1
      if (!a.title.includes('Senator') && b.title.includes('Senator')) return 1
      if (a.district && b.district) return parseInt(a.district) - parseInt(b.district)
      return 0
    })

    return NextResponse.json({
      representatives,
      state: stateNames[state] || state,
    })
  } catch (error) {
    console.error('Error fetching representatives:', error)
    return NextResponse.json(
      { error: 'Internal server error', representatives: [], state: '' },
      { status: 500 }
    )
  }
}

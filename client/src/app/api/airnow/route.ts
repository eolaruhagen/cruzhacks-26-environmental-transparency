import { NextRequest, NextResponse } from 'next/server'

const AIRNOW_API_KEY = '782E4B06-90F6-4CA9-B10C-E93E5BBC4220'
const AIRNOW_BASE_URL = 'https://www.airnowapi.org/aq'

// Major US cities for sampling national air quality
const SAMPLE_CITIES = [
  { name: 'New York', zipCode: '10001' },
  { name: 'Los Angeles', zipCode: '90001' },
  { name: 'Chicago', zipCode: '60601' },
  { name: 'Houston', zipCode: '77001' },
  { name: 'Phoenix', zipCode: '85001' },
  { name: 'Philadelphia', zipCode: '19101' },
  { name: 'San Antonio', zipCode: '78201' },
  { name: 'San Diego', zipCode: '92101' },
  { name: 'Dallas', zipCode: '75201' },
  { name: 'Denver', zipCode: '80201' },
  { name: 'Seattle', zipCode: '98101' },
  { name: 'Miami', zipCode: '33101' },
  { name: 'Atlanta', zipCode: '30301' },
  { name: 'Boston', zipCode: '02101' },
  { name: 'Detroit', zipCode: '48201' },
]

interface AirNowObservation {
  DateObserved: string
  HourObserved: number
  LocalTimeZone: string
  ReportingArea: string
  StateCode: string
  Latitude: number
  Longitude: number
  ParameterName: string
  AQI: number
  Category: {
    Number: number
    Name: string
  }
}

interface CityAirQuality {
  city: string
  zipCode: string
  observations: AirNowObservation[]
  error?: string
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const action = searchParams.get('action')

  try {
    if (action === 'current-by-zip') {
      // Get current air quality for a specific zip code
      const zipCode = searchParams.get('zipCode')
      if (!zipCode) {
        return NextResponse.json({ error: 'zipCode parameter required' }, { status: 400 })
      }

      const url = `${AIRNOW_BASE_URL}/observation/zipCode/current/?format=application/json&zipCode=${zipCode}&distance=25&API_KEY=${AIRNOW_API_KEY}`
      const response = await fetch(url)
      
      if (!response.ok) {
        throw new Error(`AirNow API error: ${response.status}`)
      }
      
      const data = await response.json()
      return NextResponse.json(data)
    }

    if (action === 'national-sample') {
      // Get air quality from major cities to approximate national conditions
      const results: CityAirQuality[] = await Promise.all(
        SAMPLE_CITIES.map(async (city) => {
          try {
            const url = `${AIRNOW_BASE_URL}/observation/zipCode/current/?format=application/json&zipCode=${city.zipCode}&distance=25&API_KEY=${AIRNOW_API_KEY}`
            const response = await fetch(url)
            
            if (!response.ok) {
              return { city: city.name, zipCode: city.zipCode, observations: [], error: `HTTP ${response.status}` }
            }
            
            const data: AirNowObservation[] = await response.json()
            return { city: city.name, zipCode: city.zipCode, observations: data }
          } catch (err) {
            return { city: city.name, zipCode: city.zipCode, observations: [], error: String(err) }
          }
        })
      )

      // Calculate national averages by pollutant
      const pollutantData: Record<string, { values: number[], cityData: { city: string, aqi: number }[] }> = {}
      
      results.forEach((cityResult) => {
        cityResult.observations.forEach((obs) => {
          if (!pollutantData[obs.ParameterName]) {
            pollutantData[obs.ParameterName] = { values: [], cityData: [] }
          }
          pollutantData[obs.ParameterName].values.push(obs.AQI)
          pollutantData[obs.ParameterName].cityData.push({ city: cityResult.city, aqi: obs.AQI })
        })
      })

      const nationalAverages = Object.entries(pollutantData).map(([pollutant, data]) => ({
        pollutant,
        averageAQI: Math.round(data.values.reduce((a, b) => a + b, 0) / data.values.length),
        minAQI: Math.min(...data.values),
        maxAQI: Math.max(...data.values),
        sampleSize: data.values.length,
        cityBreakdown: data.cityData.sort((a, b) => b.aqi - a.aqi),
      }))

      return NextResponse.json({
        timestamp: new Date().toISOString(),
        citiesSampled: SAMPLE_CITIES.length,
        nationalAverages,
        rawCityData: results,
      })
    }

    // Default: return API info
    return NextResponse.json({
      message: 'AirNow API proxy',
      availableActions: [
        'current-by-zip?zipCode=XXXXX - Get current AQI for a zip code',
        'national-sample - Get sampled national air quality from major cities',
      ],
    })
  } catch (error) {
    console.error('AirNow API error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch air quality data', details: String(error) },
      { status: 500 }
    )
  }
}

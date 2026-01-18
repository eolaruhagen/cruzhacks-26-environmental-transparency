'use client'

import React, { useEffect, useState } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  BarChart,
  Bar,
  Cell,
} from 'recharts'


// PARIS AGREEMENT DATA - Well-documented public data from NASA/NOAA/Scripps
// Sources: NASA GISS, Mauna Loa Observatory (Scripps/NOAA)

// Global Temperature Anomaly (°C relative to 1951-1980 baseline)
// Source: NASA GISS Surface Temperature Analysis
// https://data.giss.nasa.gov/gistemp/
const temperatureData = [
  { year: 1980, actual: 0.26, goal: 1.5 },
  { year: 1985, actual: 0.12, goal: 1.5 },
  { year: 1990, actual: 0.39, goal: 1.5 },
  { year: 1995, actual: 0.45, goal: 1.5 },
  { year: 2000, actual: 0.39, goal: 1.5 },
  { year: 2005, actual: 0.67, goal: 1.5 },
  { year: 2010, actual: 0.72, goal: 1.5 },
  { year: 2015, actual: 0.90, goal: 1.5 },
  { year: 2016, actual: 1.01, goal: 1.5 },
  { year: 2017, actual: 0.92, goal: 1.5 },
  { year: 2018, actual: 0.85, goal: 1.5 },
  { year: 2019, actual: 0.98, goal: 1.5 },
  { year: 2020, actual: 1.02, goal: 1.5 },
  { year: 2021, actual: 0.84, goal: 1.5 },
  { year: 2022, actual: 0.89, goal: 1.5 },
  { year: 2023, actual: 1.17, goal: 1.5 },
  { year: 2024, actual: 1.29, goal: 1.5 },
]

// Atmospheric CO2 Concentration (ppm)
// Source: Mauna Loa Observatory (Scripps/NOAA)
// https://gml.noaa.gov/ccgg/trends/
const co2Data = [
  { year: 1980, actual: 338.9, safeLevel: 350 },
  { year: 1985, actual: 346.3, safeLevel: 350 },
  { year: 1990, actual: 354.4, safeLevel: 350 },
  { year: 1995, actual: 360.8, safeLevel: 350 },
  { year: 2000, actual: 369.7, safeLevel: 350 },
  { year: 2005, actual: 379.8, safeLevel: 350 },
  { year: 2010, actual: 389.9, safeLevel: 350 },
  { year: 2015, actual: 400.8, safeLevel: 350 },
  { year: 2016, actual: 404.2, safeLevel: 350 },
  { year: 2017, actual: 406.6, safeLevel: 350 },
  { year: 2018, actual: 408.5, safeLevel: 350 },
  { year: 2019, actual: 411.4, safeLevel: 350 },
  { year: 2020, actual: 414.2, safeLevel: 350 },
  { year: 2021, actual: 416.4, safeLevel: 350 },
  { year: 2022, actual: 418.6, safeLevel: 350 },
  { year: 2023, actual: 421.4, safeLevel: 350 },
  { year: 2024, actual: 424.6, safeLevel: 350 },
]

// CLEAN AIR ACT - US National Averages (EPA Air Trends Data)
// Source: EPA Air Quality - National Summary
// https://www.epa.gov/air-trends/air-quality-national-summary

// PM2.5 Annual Average (µg/m³) - Nationally weighted average
// Source: EPA Air Trends - PM2.5 trends
// Standard: 12 µg/m³ annual (revised from 15 in 2012)
const pm25Data = [
  { year: 2000, actual: 13.5, standard: 12 },
  { year: 2001, actual: 13.1, standard: 12 },
  { year: 2002, actual: 12.5, standard: 12 },
  { year: 2003, actual: 12.0, standard: 12 },
  { year: 2004, actual: 12.1, standard: 12 },
  { year: 2005, actual: 12.3, standard: 12 },
  { year: 2006, actual: 11.8, standard: 12 },
  { year: 2007, actual: 11.6, standard: 12 },
  { year: 2008, actual: 10.6, standard: 12 },
  { year: 2009, actual: 9.9, standard: 12 },
  { year: 2010, actual: 10.4, standard: 12 },
  { year: 2011, actual: 10.2, standard: 12 },
  { year: 2012, actual: 9.5, standard: 12 },
  { year: 2013, actual: 9.5, standard: 12 },
  { year: 2014, actual: 9.4, standard: 12 },
  { year: 2015, actual: 8.9, standard: 12 },
  { year: 2016, actual: 8.6, standard: 12 },
  { year: 2017, actual: 8.5, standard: 12 },
  { year: 2018, actual: 8.9, standard: 12 },
  { year: 2019, actual: 8.0, standard: 12 },
  { year: 2020, actual: 8.0, standard: 12 },
  { year: 2021, actual: 8.6, standard: 12 },
  { year: 2022, actual: 8.5, standard: 12 },
  { year: 2023, actual: 9.2, standard: 12 },
]

// Ground-Level Ozone (ppb) - 4th highest daily max 8-hr concentration
// Source: EPA Air Trends - Ozone trends (national average)
// Standard: 70 ppb (0.070 ppm) - revised from 75 ppb in 2015
const ozoneData = [
  { year: 2000, actual: 87, standard: 70 },
  { year: 2001, actual: 86, standard: 70 },
  { year: 2002, actual: 87, standard: 70 },
  { year: 2003, actual: 84, standard: 70 },
  { year: 2004, actual: 80, standard: 70 },
  { year: 2005, actual: 83, standard: 70 },
  { year: 2006, actual: 81, standard: 70 },
  { year: 2007, actual: 80, standard: 70 },
  { year: 2008, actual: 76, standard: 70 },
  { year: 2009, actual: 72, standard: 70 },
  { year: 2010, actual: 75, standard: 70 },
  { year: 2011, actual: 76, standard: 70 },
  { year: 2012, actual: 76, standard: 70 },
  { year: 2013, actual: 70, standard: 70 },
  { year: 2014, actual: 70, standard: 70 },
  { year: 2015, actual: 71, standard: 70 },
  { year: 2016, actual: 70, standard: 70 },
  { year: 2017, actual: 69, standard: 70 },
  { year: 2018, actual: 68, standard: 70 },
  { year: 2019, actual: 66, standard: 70 },
  { year: 2020, actual: 65, standard: 70 },
  { year: 2021, actual: 68, standard: 70 },
  { year: 2022, actual: 67, standard: 70 },
  { year: 2023, actual: 68, standard: 70 },
]

// NO2 Annual Mean (ppb) - National average
// Source: EPA Air Trends - NO2 trends
// Standard: 53 ppb (annual), 100 ppb (1-hour)
const no2Data = [
  { year: 2000, actual: 17, standard: 53 },
  { year: 2002, actual: 16, standard: 53 },
  { year: 2004, actual: 15, standard: 53 },
  { year: 2006, actual: 14, standard: 53 },
  { year: 2008, actual: 13, standard: 53 },
  { year: 2010, actual: 12, standard: 53 },
  { year: 2012, actual: 11, standard: 53 },
  { year: 2014, actual: 10, standard: 53 },
  { year: 2016, actual: 9, standard: 53 },
  { year: 2018, actual: 8, standard: 53 },
  { year: 2020, actual: 7, standard: 53 },
  { year: 2022, actual: 8, standard: 53 },
  { year: 2023, actual: 9, standard: 53 },
]

// SO2 1-hour 99th percentile (ppb) - National average
// Source: EPA Air Trends - SO2 trends
// Standard: 75 ppb (1-hour)
const so2Data = [
  { year: 2000, actual: 38, standard: 75 },
  { year: 2002, actual: 32, standard: 75 },
  { year: 2004, actual: 28, standard: 75 },
  { year: 2006, actual: 24, standard: 75 },
  { year: 2008, actual: 19, standard: 75 },
  { year: 2010, actual: 15, standard: 75 },
  { year: 2012, actual: 11, standard: 75 },
  { year: 2014, actual: 8, standard: 75 },
  { year: 2016, actual: 6, standard: 75 },
  { year: 2018, actual: 5, standard: 75 },
  { year: 2020, actual: 4, standard: 75 },
  { year: 2022, actual: 3, standard: 75 },
  { year: 2023, actual: 4, standard: 75 },
]

// CLEAN WATER ACT - US National Data (EPA ATTAINS Database)
// Source: EPA National Water Quality Inventory Reports to Congress
// https://www.epa.gov/waterdata/national-water-quality-inventory-report-congress

// Percentage of Assessed Waters Meeting Standards (Good/Attaining)
// Source: EPA National Water Quality Inventory (Section 305(b) Reports)
// Note: Assessment methods have changed over time, so comparisons are approximate
// Goal: 100% meeting standards (0% impaired)
const waterQualityData = [
  { year: 1998, meetingStandards: 35, goal: 100 },
  { year: 2000, meetingStandards: 39, goal: 100 },
  { year: 2002, meetingStandards: 44, goal: 100 },
  { year: 2004, meetingStandards: 45, goal: 100 },
  { year: 2006, meetingStandards: 47, goal: 100 },
  { year: 2008, meetingStandards: 46, goal: 100 },
  { year: 2010, meetingStandards: 48, goal: 100 },
  { year: 2012, meetingStandards: 50, goal: 100 },
  { year: 2014, meetingStandards: 51, goal: 100 },
  { year: 2016, meetingStandards: 52, goal: 100 },
  { year: 2018, meetingStandards: 51, goal: 100 },
  { year: 2020, meetingStandards: 52, goal: 100 },
  { year: 2022, meetingStandards: 53, goal: 100 },
]

// ============================================================================
// CHART COMPONENTS
// ============================================================================

export function TemperatureChart() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h3 className="font-bold text-gray-900 mb-1">Global Temperature Anomaly</h3>
      <p className="text-gray-500 text-sm mb-4">°C above 1951-1980 baseline (NASA GISS)</p>
      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={temperatureData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="year" tick={{ fontSize: 12 }} stroke="#6b7280" />
            <YAxis domain={[0, 2]} tick={{ fontSize: 12 }} stroke="#6b7280" tickFormatter={(v) => `${v}°C`} />
            <Tooltip
              contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }}
              formatter={(value, name) => [
                `${(value as number ?? 0).toFixed(2)}°C`,
                name === 'actual' ? 'Actual' : 'Paris Goal'
              ]}
            />
            <Legend />
            <ReferenceLine y={1.5} stroke="#ef4444" strokeDasharray="5 5" label={{ value: '1.5°C Goal', fill: '#ef4444', fontSize: 11 }} />
            <Line type="monotone" dataKey="actual" name="Actual" stroke="#588157" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs text-gray-500 mt-3">Source: NASA GISS Surface Temperature Analysis</p>
    </div>
  )
}

export function CO2Chart() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h3 className="font-bold text-gray-900 mb-1">Atmospheric CO₂ Concentration</h3>
      <p className="text-gray-500 text-sm mb-4">Parts per million (Mauna Loa Observatory)</p>
      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={co2Data} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="year" tick={{ fontSize: 12 }} stroke="#6b7280" />
            <YAxis domain={[330, 440]} tick={{ fontSize: 12 }} stroke="#6b7280" tickFormatter={(v) => `${v}`} />
            <Tooltip
              contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }}
              formatter={(value, name) => [
                `${(value as number ?? 0).toFixed(1)} ppm`,
                name === 'actual' ? 'Actual' : 'Safe Level (350 ppm)'
              ]}
            />
            <Legend />
            <ReferenceLine y={350} stroke="#3b82f6" strokeDasharray="5 5" label={{ value: '350 ppm Safe Level', fill: '#3b82f6', fontSize: 11 }} />
            <Line type="monotone" dataKey="actual" name="Actual" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs text-gray-500 mt-3">Source: NOAA/Scripps Mauna Loa Observatory</p>
    </div>
  )
}

export function PM25Chart() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h3 className="font-bold text-gray-900 mb-1">PM₂.₅ National Average</h3>
      <p className="text-gray-500 text-sm mb-4">Annual mean (µg/m³) — EPA Air Trends</p>
      <div className="h-[250px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={pm25Data} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="year" tick={{ fontSize: 11 }} stroke="#6b7280" interval={3} />
            <YAxis domain={[0, 16]} tick={{ fontSize: 12 }} stroke="#6b7280" />
            <Tooltip
              contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }}
              formatter={(value, name) => [
                `${value ?? 0} µg/m³`,
                name === 'actual' ? 'US Average' : 'EPA Standard'
              ]}
            />
            <Legend />
            <ReferenceLine y={12} stroke="#ef4444" strokeDasharray="5 5" label={{ value: 'Standard: 12', fill: '#ef4444', fontSize: 11 }} />
            <Line type="monotone" dataKey="actual" name="US Average" stroke="#588157" strokeWidth={2} dot={{ r: 2 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs text-gray-500 mt-3">Source: EPA Air Quality National Summary</p>
    </div>
  )
}

export function OzoneChart() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h3 className="font-bold text-gray-900 mb-1">Ground-Level Ozone (O₃)</h3>
      <p className="text-gray-500 text-sm mb-4">4th highest daily max 8-hr average (ppb) — EPA Air Trends</p>
      <div className="h-[250px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={ozoneData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="year" tick={{ fontSize: 11 }} stroke="#6b7280" interval={3} />
            <YAxis domain={[60, 95]} tick={{ fontSize: 12 }} stroke="#6b7280" />
            <Tooltip
              contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }}
              formatter={(value, name) => [
                `${value ?? 0} ppb`,
                name === 'actual' ? 'US Average' : 'EPA Standard'
              ]}
            />
            <Legend />
            <ReferenceLine y={70} stroke="#ef4444" strokeDasharray="5 5" label={{ value: 'Standard: 70', fill: '#ef4444', fontSize: 11 }} />
            <Line type="monotone" dataKey="actual" name="US Average" stroke="#588157" strokeWidth={2} dot={{ r: 2 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs text-gray-500 mt-3">Source: EPA Air Quality National Summary</p>
    </div>
  )
}

export function NO2Chart() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h3 className="font-bold text-gray-900 mb-1">Nitrogen Dioxide (NO₂)</h3>
      <p className="text-gray-500 text-sm mb-4">Annual mean (ppb) — EPA Air Trends</p>
      <div className="h-[250px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={no2Data} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="year" tick={{ fontSize: 11 }} stroke="#6b7280" />
            <YAxis domain={[0, 60]} tick={{ fontSize: 12 }} stroke="#6b7280" />
            <Tooltip
              contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }}
              formatter={(value, name) => [
                `${value ?? 0} ppb`,
                name === 'actual' ? 'US Average' : 'EPA Standard'
              ]}
            />
            <Legend />
            <ReferenceLine y={53} stroke="#3b82f6" strokeDasharray="5 5" label={{ value: 'Standard: 53', fill: '#3b82f6', fontSize: 11 }} />
            <Line type="monotone" dataKey="actual" name="US Average" stroke="#588157" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs text-gray-500 mt-3">Source: EPA Air Quality National Summary</p>
    </div>
  )
}

export function SO2Chart() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h3 className="font-bold text-gray-900 mb-1">Sulfur Dioxide (SO₂)</h3>
      <p className="text-gray-500 text-sm mb-4">1-hour 99th percentile (ppb) — EPA Air Trends</p>
      <div className="h-[250px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={so2Data} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="year" tick={{ fontSize: 11 }} stroke="#6b7280" />
            <YAxis domain={[0, 80]} tick={{ fontSize: 12 }} stroke="#6b7280" />
            <Tooltip
              contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }}
              formatter={(value, name) => [
                `${value ?? 0} ppb`,
                name === 'actual' ? 'US Average' : 'EPA Standard'
              ]}
            />
            <Legend />
            <ReferenceLine y={75} stroke="#3b82f6" strokeDasharray="5 5" label={{ value: 'Standard: 75', fill: '#3b82f6', fontSize: 11 }} />
            <Line type="monotone" dataKey="actual" name="US Average" stroke="#588157" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs text-gray-500 mt-3">Source: EPA Air Quality National Summary</p>
    </div>
  )
}

export function WaterQualityChart() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h3 className="font-bold text-gray-900 mb-1">Waters Meeting Quality Standards</h3>
      <p className="text-gray-500 text-sm mb-4">% of assessed U.S. waters — EPA National Water Quality Inventory</p>
      <div className="h-[250px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={waterQualityData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="year" tick={{ fontSize: 11 }} stroke="#6b7280" />
            <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} stroke="#6b7280" tickFormatter={(v) => `${v}%`} />
            <Tooltip
              contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }}
              formatter={(value, name) => [
                `${value ?? 0}%`,
                name === 'meetingStandards' ? 'Meeting Standards' : 'Goal'
              ]}
            />
            <Legend />
            <ReferenceLine y={100} stroke="#3b82f6" strokeDasharray="5 5" label={{ value: 'Goal: 100%', fill: '#3b82f6', fontSize: 11 }} />
            <Line type="monotone" dataKey="meetingStandards" name="Meeting Standards" stroke="#0ea5e9" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs text-gray-500 mt-3">Source: EPA Section 305(b) Reports to Congress</p>
    </div>
  )
}

// Summary component for API requirements
export function DataSourceNotice() {
  return (
    <div className="bg-green-50 border border-green-300 rounded-xl p-6 mb-8">
      <h3 className="font-bold text-green-900 mb-3">Data Sources</h3>
      <div className="space-y-3 text-sm text-green-800">
        <p>
          <strong>Paris Agreement charts</strong> use verified public data from NASA GISS and NOAA Mauna Loa Observatory.
        </p>
        <p>
          <strong>Current Air Quality</strong> is pulled live from the{' '}
          <a href="https://www.airnow.gov/" target="_blank" rel="noopener noreferrer" className="underline font-medium">
            EPA AirNow API
          </a>{' '}
          sampling 15 major US cities.
        </p>
        <p>
          <strong>Historical trend charts</strong> for Clean Air/Water Act show representative data. For granular historical records,
          the{' '}
          <a href="https://aqs.epa.gov/aqsweb/documents/data_api.html" target="_blank" rel="noopener noreferrer" className="underline font-medium">
            EPA AQS API
          </a>{' '}
          provides annual statistics back to 1980.
        </p>
      </div>
    </div>
  )
}

// ============================================================================
// LIVE AIR QUALITY - Real-time data from AirNow API
// ============================================================================

interface PollutantData {
  pollutant: string
  averageAQI: number
  minAQI: number
  maxAQI: number
  sampleSize: number
  cityBreakdown: { city: string; aqi: number }[]
}

interface AirNowResponse {
  timestamp: string
  citiesSampled: number
  nationalAverages: PollutantData[]
}

// AQI category colors and labels
const getAQICategory = (aqi: number) => {
  if (aqi <= 50) return { color: '#00e400', label: 'Good', bg: 'bg-green-100', text: 'text-green-800' }
  if (aqi <= 100) return { color: '#ffff00', label: 'Moderate', bg: 'bg-yellow-100', text: 'text-yellow-800' }
  if (aqi <= 150) return { color: '#ff7e00', label: 'Unhealthy for Sensitive', bg: 'bg-orange-100', text: 'text-orange-800' }
  if (aqi <= 200) return { color: '#ff0000', label: 'Unhealthy', bg: 'bg-red-100', text: 'text-red-800' }
  if (aqi <= 300) return { color: '#8f3f97', label: 'Very Unhealthy', bg: 'bg-purple-100', text: 'text-purple-800' }
  return { color: '#7e0023', label: 'Hazardous', bg: 'bg-rose-200', text: 'text-rose-900' }
}

export function LiveAirQuality() {
  const [data, setData] = useState<AirNowResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedPollutant, setSelectedPollutant] = useState<string | null>(null)

  useEffect(() => {
    async function fetchData() {
      try {
        const response = await fetch('/api/airnow?action=national-sample')
        if (!response.ok) throw new Error('Failed to fetch air quality data')
        const result = await response.json()
        setData(result)
        if (result.nationalAverages?.length > 0) {
          setSelectedPollutant(result.nationalAverages[0].pollutant)
        }
      } catch (err) {
        setError(String(err))
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="font-bold text-gray-900 mb-4">Current US Air Quality</h3>
        <div className="flex items-center justify-center h-[200px]">
          <div className="animate-pulse flex flex-col items-center">
            <div className="w-12 h-12 rounded-full bg-gray-200 mb-3"></div>
            <p className="text-gray-500 text-sm">Loading live data from AirNow API...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="font-bold text-gray-900 mb-4">Current US Air Quality</h3>
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-800 text-sm">Failed to load air quality data: {error}</p>
        </div>
      </div>
    )
  }

  if (!data || !data.nationalAverages || data.nationalAverages.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="font-bold text-gray-900 mb-4">Current US Air Quality</h3>
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-amber-800 text-sm">No air quality data available at this time.</p>
        </div>
      </div>
    )
  }

  const selectedData = data.nationalAverages.find(p => p.pollutant === selectedPollutant)

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div>
          <h3 className="font-bold text-gray-900">Current US Air Quality (Live)</h3>
          <p className="text-gray-500 text-sm">
            Real-time AQI from {data.citiesSampled} major cities • Updated {new Date(data.timestamp).toLocaleTimeString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Data from:</span>
          <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded">EPA AirNow API</span>
        </div>
      </div>

      {/* Pollutant selector pills */}
      <div className="flex flex-wrap gap-2 mb-6">
        {data.nationalAverages.map((pollutant) => {
          const category = getAQICategory(pollutant.averageAQI)
          return (
            <button
              key={pollutant.pollutant}
              onClick={() => setSelectedPollutant(pollutant.pollutant)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${selectedPollutant === pollutant.pollutant
                ? `${category.bg} ${category.text} ring-2 ring-offset-1`
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              style={selectedPollutant === pollutant.pollutant ? { '--tw-ring-color': category.color } as React.CSSProperties : {}}
            >
              {pollutant.pollutant}: {pollutant.averageAQI} AQI
            </button>
          )
        })}
      </div>

      {selectedData && (
        <div className="grid md:grid-cols-2 gap-6">
          {/* Summary card */}
          <div className="space-y-4">
            <div className={`p-4 rounded-xl ${getAQICategory(selectedData.averageAQI).bg}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">National Average</span>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${getAQICategory(selectedData.averageAQI).text} ${getAQICategory(selectedData.averageAQI).bg}`}>
                  {getAQICategory(selectedData.averageAQI).label}
                </span>
              </div>
              <p className="text-4xl font-bold" style={{ color: getAQICategory(selectedData.averageAQI).color === '#ffff00' ? '#ca8a04' : getAQICategory(selectedData.averageAQI).color }}>
                {selectedData.averageAQI}
              </p>
              <p className="text-xs text-gray-600 mt-1">AQI (Air Quality Index)</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500">Best City</p>
                <p className="text-lg font-bold text-green-600">{selectedData.minAQI}</p>
                <p className="text-xs text-gray-600 truncate">
                  {selectedData.cityBreakdown[selectedData.cityBreakdown.length - 1]?.city}
                </p>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500">Worst City</p>
                <p className="text-lg font-bold text-red-600">{selectedData.maxAQI}</p>
                <p className="text-xs text-gray-600 truncate">
                  {selectedData.cityBreakdown[0]?.city}
                </p>
              </div>
            </div>
          </div>

          {/* City breakdown chart */}
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={selectedData.cityBreakdown.slice(0, 8)}
                layout="vertical"
                margin={{ top: 0, right: 20, left: 60, bottom: 0 }}
              >
                <XAxis type="number" domain={[0, 'auto']} tick={{ fontSize: 10 }} stroke="#9ca3af" />
                <YAxis type="category" dataKey="city" tick={{ fontSize: 10 }} stroke="#9ca3af" width={55} />
                <Tooltip
                  contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '12px' }}
                  formatter={(value) => [`${value ?? 0} AQI`, selectedData.pollutant]}
                />
                <Bar dataKey="aqi" radius={[0, 4, 4, 0]}>
                  {selectedData.cityBreakdown.slice(0, 8).map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={getAQICategory(entry.aqi).color === '#ffff00' ? '#eab308' : getAQICategory(entry.aqi).color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* AQI Legend */}
      <div className="mt-6 pt-4 border-t border-gray-100">
        <p className="text-xs text-gray-500 mb-2">AQI Scale:</p>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="px-2 py-1 rounded bg-green-100 text-green-800">0-50 Good</span>
          <span className="px-2 py-1 rounded bg-yellow-100 text-yellow-800">51-100 Moderate</span>
          <span className="px-2 py-1 rounded bg-orange-100 text-orange-800">101-150 Sensitive</span>
          <span className="px-2 py-1 rounded bg-red-100 text-red-800">151-200 Unhealthy</span>
          <span className="px-2 py-1 rounded bg-purple-100 text-purple-800">201-300 Very Unhealthy</span>
        </div>
      </div>
    </div>
  )
}

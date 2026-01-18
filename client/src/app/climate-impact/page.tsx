import React from 'react'
import { 
  TemperatureChart, 
  CO2Chart, 
  PM25Chart, 
  OzoneChart, 
  NO2Chart,
  SO2Chart,
  WaterQualityChart,
  DataSourceNotice,
  LiveAirQuality,
} from './ClimateCharts'

export default function ClimateImpactPage() {
  return (
    <main className="min-h-screen pt-24 p-8 bg-main">
      <div className="max-w-5xl mx-auto">
        
        {/* Header */}
        <header className="mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-accent/10 rounded-full text-accent text-sm font-medium mb-4">
            Climate Science
          </div>
          <h1 className="text-4xl lg:text-5xl font-bold text-main mb-4">
            Measuring Climate Impact
          </h1>
          <p className="text-lg text-main/80 leading-relaxed">
            Understanding the key metrics scientists and policymakers use to track climate change, 
            air quality, water health, and biodiversity—and where we stand against our goals.
          </p>
        </header>

        {/* Data Source Notice */}
        <DataSourceNotice />

        {/* Section 1: Paris Agreement */}
        <section className="mb-14">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-main">Paris Agreement Metrics</h2>
            <p className="text-main/60 text-sm">Global Climate Goals</p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
            <p className="text-gray-700 leading-relaxed mb-4">
              The Paris Agreement's primary goal is to limit global warming to <strong>well below 2°C</strong>, 
              preferably <strong>1.5°C</strong>, compared to pre-industrial levels (1850–1900). Every fraction 
              of a degree matters—0.5°C can mean the difference between manageable adaptation and catastrophic change.
            </p>
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
              <p className="text-red-800 text-sm font-medium">
                Current trajectory: We're on track for approximately 2.7°C warming by 2100 under current policies.
              </p>
            </div>
          </div>

          {/* Paris Agreement Charts */}
          <div className="grid md:grid-cols-2 gap-6 mb-6">
            <TemperatureChart />
            <CO2Chart />
          </div>

          {/* Metric Cards */}
          <div className="grid md:grid-cols-3 gap-4">
            <div className="bg-card rounded-xl p-5 border border-border">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-main">Global Temperature Anomaly</h3>
                <span className="text-xs px-2 py-1 bg-accent/20 text-accent rounded-full">Primary</span>
              </div>
              <p className="text-main/70 text-sm mb-4">
                Measures deviation from the 1850–1900 baseline average. The "headline" metric of climate change.
              </p>
              <div className="pt-3 border-t border-border">
                <p className="text-xs text-main/60 mb-1">Goal</p>
                <p className="text-2xl font-bold text-accent">≤ 1.5°C</p>
                <p className="text-xs text-main/60 mt-2">
                  Source: <a href="https://data.giss.nasa.gov/gistemp/" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">NASA GISS</a>
                </p>
              </div>
            </div>

            <div className="bg-card rounded-xl p-5 border border-border">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-main">Atmospheric CO₂</h3>
                <span className="text-xs px-2 py-1 bg-accent/20 text-accent rounded-full">Driver</span>
              </div>
              <p className="text-main/70 text-sm mb-4">
                The "thermostat" of the planet. Measured in parts per million (ppm). Pre-industrial level was ~280 ppm.
              </p>
              <div className="pt-3 border-t border-border">
                <p className="text-xs text-main/60 mb-1">Safe Level</p>
                <p className="text-2xl font-bold text-accent">≤ 350 ppm</p>
                <p className="text-xs text-main/60 mt-2">
                  Current: ~424 ppm | <a href="https://keelingcurve.ucsd.edu/" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">Mauna Loa</a>
                </p>
              </div>
            </div>

            <div className="bg-card rounded-xl p-5 border border-border">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-main">Annual Emissions</h3>
                <span className="text-xs px-2 py-1 bg-accent/20 text-accent rounded-full">Action</span>
              </div>
              <p className="text-main/70 text-sm mb-4">
                GtCO₂e (Gigatonnes of CO₂ equivalent). Includes methane, nitrous oxide, and other greenhouse gases.
              </p>
              <div className="pt-3 border-t border-border">
                <p className="text-xs text-main/60 mb-1">2030 Target</p>
                <p className="text-2xl font-bold text-accent">~25 GtCO₂e</p>
                <p className="text-xs text-main/60 mt-2">
                  Current: ~59 GtCO₂e | <a href="https://climateactiontracker.org/" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">Climate Action Tracker</a>
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Section 2: Clean Air Act */}
        <section className="mb-14">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-main">Clean Air Act Metrics</h2>
            <p className="text-main/60 text-sm">Atmospheric Health & Air Quality</p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
            <p className="text-gray-700 leading-relaxed">
              The Clean Air Act focuses on <strong>"Criteria Pollutants"</strong> that directly affect human health. 
              These are highly localized—your air quality can differ from a city just miles away. The <strong>Air 
              Quality Index (AQI)</strong> is the public-facing summary of these measurements.
            </p>
          </div>

          {/* Live Air Quality - Real-time from AirNow API */}
          <div className="mb-6">
            <LiveAirQuality />
          </div>

          {/* Clean Air Charts - Historical Trends */}
          <h3 className="font-semibold text-gray-700 mb-3 mt-8">Historical Trends (2000–2023)</h3>
          <p className="text-gray-500 text-sm mb-4">Data from EPA Air Quality National Summary — showing dramatic improvements since Clean Air Act enforcement</p>
          <div className="grid md:grid-cols-2 gap-6 mb-6">
            <PM25Chart />
            <OzoneChart />
            <NO2Chart />
            <SO2Chart />
          </div>

          {/* Metric Cards */}
          <div className="grid md:grid-cols-2 gap-4 mb-6">
            <div className="bg-card rounded-xl p-5 border border-border">
              <h3 className="font-bold text-main mb-2">PM₂.₅ & PM₁₀</h3>
              <p className="text-main/70 text-sm mb-3">
                Fine particulate matter small enough to enter lungs and bloodstream. The most dangerous 
                and widely-tracked air pollutant. Primary component of AQI calculations.
              </p>
              <div className="flex items-center justify-between pt-3 border-t border-border">
                <div>
                  <p className="text-xs text-main/60">24-hr Standard (PM₂.₅)</p>
                  <p className="text-xl font-bold text-accent">≤ 35 µg/m³</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-main/60">Annual Standard</p>
                  <p className="text-xl font-bold text-accent">≤ 12 µg/m³</p>
                </div>
              </div>
            </div>

            <div className="bg-card rounded-xl p-5 border border-border">
              <h3 className="font-bold text-main mb-2">Ground-Level Ozone (O₃)</h3>
              <p className="text-main/70 text-sm mb-3">
                Primary component of smog. Forms when pollutants from cars and industry react with sunlight. 
                Measured in parts per billion (ppb). Worse on hot, sunny days.
              </p>
              <div className="pt-3 border-t border-border">
                <p className="text-xs text-main/60">8-hour Standard</p>
                <p className="text-xl font-bold text-accent">≤ 70 ppb</p>
              </div>
            </div>

            <div className="bg-card rounded-xl p-5 border border-border">
              <h3 className="font-bold text-main mb-2">Nitrogen Dioxide (NO₂)</h3>
              <p className="text-main/70 text-sm mb-3">
                Primarily from vehicle exhaust and power plants. High levels indicate heavy traffic or 
                industrial activity. Contributes to respiratory problems and smog formation.
              </p>
              <div className="pt-3 border-t border-border">
                <p className="text-xs text-main/60">1-hour Standard</p>
                <p className="text-xl font-bold text-accent">≤ 100 ppb</p>
              </div>
            </div>

            <div className="bg-card rounded-xl p-5 border border-border">
              <h3 className="font-bold text-main mb-2">Sulfur Dioxide (SO₂)</h3>
              <p className="text-main/70 text-sm mb-3">
                From burning fossil fuels, especially coal. Causes acid rain and respiratory issues. 
                Levels have dropped dramatically since the Clean Air Act's acid rain program.
              </p>
              <div className="pt-3 border-t border-border">
                <p className="text-xs text-main/60">1-hour Standard</p>
                <p className="text-xl font-bold text-accent">≤ 75 ppb</p>
              </div>
            </div>
          </div>

          <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
            <p className="text-blue-800 text-sm">
              <strong>Check Your Air:</strong> Visit{' '}
              <a href="https://www.airnow.gov/" target="_blank" rel="noopener noreferrer" className="underline">AirNow.gov</a>{' '}
              or{' '}
              <a href="https://openaq.org/" target="_blank" rel="noopener noreferrer" className="underline">OpenAQ</a>{' '}
              for real-time air quality data in your area and global comparisons.
            </p>
          </div>
        </section>

        {/* Section 3: Clean Water Act */}
        <section className="mb-14">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-main">Clean Water Act Metrics</h2>
            <p className="text-main/60 text-sm">Aquatic Health & Water Quality</p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
            <p className="text-gray-700 leading-relaxed">
              The Clean Water Act's goal is to make all U.S. waters <strong>"fishable and swimmable."</strong> 
              Water quality is complex and varies by location and intended use. These metrics provide the 
              most accessible snapshot of watershed health.
            </p>
          </div>

          {/* Water Quality Chart */}
          <div className="mb-6">
            <WaterQualityChart />
          </div>

          {/* Metric Cards */}
          <div className="grid md:grid-cols-3 gap-4 mb-6">
            <div className="bg-card rounded-xl p-5 border border-border">
              <h3 className="font-bold text-main mb-2">Impaired Waters</h3>
              <p className="text-main/70 text-sm mb-3">
                Percentage of water bodies failing to meet quality standards for their intended use 
                (drinking, swimming, fishing, etc.).
              </p>
              <div className="pt-3 border-t border-border">
                <p className="text-xs text-main/60">Goal</p>
                <p className="text-xl font-bold text-accent">0%</p>
                <p className="text-xs text-main/60 mt-1">Current U.S. avg: ~50% impaired</p>
              </div>
            </div>

            <div className="bg-card rounded-xl p-5 border border-border">
              <h3 className="font-bold text-main mb-2">Nutrient Loading</h3>
              <p className="text-main/70 text-sm mb-3">
                Nitrogen & Phosphorus levels (mg/L). Main cause of "Dead Zones" and toxic algae blooms. 
                Often from agricultural runoff.
              </p>
              <div className="pt-3 border-t border-border">
                <p className="text-xs text-main/60">Total Phosphorus Limit</p>
                <p className="text-xl font-bold text-accent">≤ 0.1 mg/L</p>
                <p className="text-xs text-main/60 mt-1">(varies by water body type)</p>
              </div>
            </div>

            <div className="bg-card rounded-xl p-5 border border-border">
              <h3 className="font-bold text-main mb-2">Dissolved Oxygen (DO)</h3>
              <p className="text-main/70 text-sm mb-3">
                Fish and aquatic life need oxygen. Low DO levels indicate ecosystem collapse, often 
                caused by nutrient pollution and algae die-offs.
              </p>
              <div className="pt-3 border-t border-border">
                <p className="text-xs text-main/60">Healthy Level</p>
                <p className="text-xl font-bold text-accent">≥ 5 mg/L</p>
                <p className="text-xs text-main/60 mt-1">Below 2 mg/L = "Dead Zone"</p>
              </div>
            </div>
          </div>

          <div className="p-4 bg-cyan-50 border border-cyan-200 rounded-xl">
            <p className="text-cyan-800 text-sm">
              <strong>Check Your Water:</strong> Use the EPA's{' '}
              <a href="https://mywaterway.epa.gov/" target="_blank" rel="noopener noreferrer" className="underline">How's My Waterway</a>{' '}
              app to enter any zip code and see the health of your local watershed.
            </p>
          </div>
        </section>

        {/* Section 4: Biodiversity */}
        <section className="mb-14">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-main">Living Planet Index</h2>
            <p className="text-main/60 text-sm">Biodiversity & Ecosystem Health</p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
            <p className="text-gray-700 leading-relaxed mb-4">
              The <strong>Living Planet Index (LPI)</strong> tracks the average change in population size of 
              thousands of vertebrate species worldwide. It's increasingly used alongside climate metrics 
              because <em>climate change isn't just about heat—it's about the collapse of biological systems 
              that support human life.</em>
            </p>
            <p className="text-gray-700 leading-relaxed">
              A declining LPI suggests that even if we meet "Net Zero" carbon goals, we may still be losing 
              the "infrastructure" of nature—pollinators, food chains, and ecosystem services we depend on.
            </p>
          </div>

          <div className="bg-card rounded-xl p-6 border border-border mb-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="font-bold text-main text-lg mb-1">Global Living Planet Index</h3>
                <p className="text-main/70 text-sm">Average vertebrate population change since 1970</p>
              </div>
              <div className="text-center md:text-right">
                <p className="text-4xl font-bold text-red-600">-69%</p>
                <p className="text-xs text-main/60">as of 2022 report</p>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-border">
              <p className="text-main/70 text-sm">
                <strong>What this means:</strong> Wildlife populations have declined by an average of 69% in 
                just 50 years. Freshwater species (-83%) and tropical regions are hit hardest.
              </p>
            </div>
          </div>

          <div className="p-4 bg-green-50 border border-green-200 rounded-xl">
            <p className="text-green-800 text-sm">
              <strong>Source:</strong> WWF{' '}
              <a href="https://livingplanet.panda.org/" target="_blank" rel="noopener noreferrer" className="underline">Living Planet Report</a>{' '}
              — Updated every two years with data from the Zoological Society of London.
            </p>
          </div>
        </section>

        {/* Why These Metrics Matter */}
        <section className="mb-12 bg-accent/10 border border-accent/20 rounded-2xl p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Why Track These Metrics?</h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h3 className="font-semibold text-gray-900 mb-2">Accountability</h3>
              <p className="text-gray-700 text-sm">
                Metrics create measurable goals. Without numbers, it's impossible to know if policies are working 
                or if leaders are keeping their promises.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 mb-2">Early Warning</h3>
              <p className="text-gray-700 text-sm">
                Trends in these metrics can warn us of problems before they become crises—allowing time for 
                policy interventions.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 mb-2">Informed Voting</h3>
              <p className="text-gray-700 text-sm">
                Understanding the data helps you evaluate candidates' environmental claims and hold elected 
                officials accountable.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 mb-2">Global Context</h3>
              <p className="text-gray-700 text-sm">
                Climate change is global. These metrics let you compare your country's progress against 
                international goals and other nations.
              </p>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="mb-12 bg-white rounded-2xl border border-gray-200 p-8 text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Take Action</h2>
          <p className="text-gray-700 mb-6 max-w-2xl mx-auto">
            Your representatives vote on climate policy, EPA funding, and environmental regulations. 
            Find out who represents you and how they've voted on environmental issues.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a 
              href="/my_rep"
              className="px-6 py-3 bg-accent text-white rounded-xl font-semibold hover:bg-accent-dark transition-all duration-200 shadow-lg hover:shadow-xl"
            >
              Find Your Representatives
            </a>
            <a 
              href="/environmental-protection"
              className="px-6 py-3 bg-card text-main rounded-xl font-semibold hover:bg-card-hover transition-all duration-200"
            >
              Environmental Law Basics
            </a>
          </div>
        </section>

        {/* Back Link */}
        <div className="mt-8">
          <a 
            href="/"
            className="text-accent hover:text-accent-dark font-medium transition-colors"
          >
            ← Back to Home
          </a>
        </div>
      </div>
    </main>
  )
}

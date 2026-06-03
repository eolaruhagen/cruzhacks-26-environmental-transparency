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
import { Card } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { AlertBox } from "@/components/ui/AlertBox"

export default function ClimateImpactPage() {
  return (
    <main className="min-h-screen pt-24 p-8 bg-main">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <header className="mb-12">
          <span className="wf-badge text-accent mb-4">
            Climate Science
          </span>
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
            <p className="wf-label mt-1">Global Climate Goals</p>
          </div>

          <Card variant="section" className="mb-6">
            <p className="text-main/80 leading-relaxed mb-4">
              The Paris Agreement&apos;s primary goal is to limit global warming to <strong>well below 2°C</strong>,
              preferably <strong>1.5°C</strong>, compared to pre-industrial levels (1850–1900). Every fraction
              of a degree matters—0.5°C can mean the difference between manageable adaptation and catastrophic change.
            </p>
            <AlertBox variant="warning">
              <p className="text-alert-warning text-sm font-medium">
                Current trajectory: We&apos;re on track for approximately 2.7°C warming by 2100 under current policies.
              </p>
            </AlertBox>
          </Card>

          {/* Paris Agreement Charts */}
          <div className="grid md:grid-cols-2 gap-6 mb-6">
            <TemperatureChart />
            <CO2Chart />
          </div>

          {/* Metric Cards */}
          <div className="grid md:grid-cols-3 gap-4">
            <Card>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-main">Global Temperature Anomaly</h3>
                <span className="wf-badge text-accent">Primary</span>
              </div>
              <p className="text-main/70 text-sm mb-4">
                Measures deviation from the 1850–1900 baseline average. The &quot;headline&quot; metric of climate change.
              </p>
              <div className="pt-3 wf-divider">
                <p className="text-xs text-main/60 mb-1">Goal</p>
                <p className="text-2xl font-bold text-accent">≤ 1.5°C</p>
                <p className="text-xs text-main/60 mt-2">
                  Source: <a href="https://data.giss.nasa.gov/gistemp/" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">NASA GISS</a>
                </p>
              </div>
            </Card>

            <Card>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-main">Atmospheric CO₂</h3>
                <span className="wf-badge text-accent">Driver</span>
              </div>
              <p className="text-main/70 text-sm mb-4">
                The &quot;thermostat&quot; of the planet. Measured in parts per million (ppm). Pre-industrial level was ~280 ppm.
              </p>
              <div className="pt-3 wf-divider">
                <p className="text-xs text-main/60 mb-1">Safe Level</p>
                <p className="text-2xl font-bold text-accent">≤ 350 ppm</p>
                <p className="text-xs text-main/60 mt-2">
                  Current: ~424 ppm | <a href="https://keelingcurve.ucsd.edu/" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">Mauna Loa</a>
                </p>
              </div>
            </Card>

            <Card>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-main">Annual Emissions</h3>
                <span className="wf-badge text-accent">Action</span>
              </div>
              <p className="text-main/70 text-sm mb-4">
                GtCO₂e (Gigatonnes of CO₂ equivalent). Includes methane, nitrous oxide, and other greenhouse gases.
              </p>
              <div className="pt-3 wf-divider">
                <p className="text-xs text-main/60 mb-1">2030 Target</p>
                <p className="text-2xl font-bold text-accent">~25 GtCO₂e</p>
                <p className="text-xs text-main/60 mt-2">
                  Current: ~59 GtCO₂e | <a href="https://climateactiontracker.org/" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">Climate Action Tracker</a>
                </p>
              </div>
            </Card>
          </div>
        </section>

        {/* Section 2: Clean Air Act */}
        <section className="mb-14">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-main">Clean Air Act Metrics</h2>
            <p className="wf-label mt-1">Atmospheric Health & Air Quality</p>
          </div>

          <Card variant="section" className="mb-6">
            <p className="text-main/80 leading-relaxed">
              The Clean Air Act focuses on <strong>&quot;Criteria Pollutants&quot;</strong> that directly affect human health.
              These are highly localized—your air quality can differ from a city just miles away. The <strong>Air
              Quality Index (AQI)</strong> is the public-facing summary of these measurements.
            </p>
          </Card>

          {/* Live Air Quality - Real-time from AirNow API */}
          <div className="mb-6">
            <LiveAirQuality />
          </div>

          {/* Clean Air Charts - Historical Trends */}
          <h3 className="font-semibold text-main/80 mb-3 mt-8">Historical Trends (2000–2023)</h3>
          <p className="text-main/60 text-sm mb-4">Data from EPA Air Quality National Summary — showing dramatic improvements since Clean Air Act enforcement</p>
          <div className="grid md:grid-cols-2 gap-6 mb-6">
            <PM25Chart />
            <OzoneChart />
            <NO2Chart />
            <SO2Chart />
          </div>

          {/* Metric Cards */}
          <div className="grid md:grid-cols-2 gap-4 mb-6">
            <Card>
              <h3 className="font-bold text-main mb-2">PM₂.₅ & PM₁₀</h3>
              <p className="text-main/70 text-sm mb-3">
                Fine particulate matter small enough to enter lungs and bloodstream. The most dangerous
                and widely-tracked air pollutant. Primary component of AQI calculations.
              </p>
              <div className="flex items-center justify-between pt-3 wf-divider">
                <div>
                  <p className="text-xs text-main/60">24-hr Standard (PM₂.₅)</p>
                  <p className="text-xl font-bold text-accent">≤ 35 µg/m³</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-main/60">Annual Standard</p>
                  <p className="text-xl font-bold text-accent">≤ 12 µg/m³</p>
                </div>
              </div>
            </Card>

            <Card>
              <h3 className="font-bold text-main mb-2">Ground-Level Ozone (O₃)</h3>
              <p className="text-main/70 text-sm mb-3">
                Primary component of smog. Forms when pollutants from cars and industry react with sunlight.
                Measured in parts per billion (ppb). Worse on hot, sunny days.
              </p>
              <div className="pt-3 wf-divider">
                <p className="text-xs text-main/60">8-hour Standard</p>
                <p className="text-xl font-bold text-accent">≤ 70 ppb</p>
              </div>
            </Card>

            <Card>
              <h3 className="font-bold text-main mb-2">Nitrogen Dioxide (NO₂)</h3>
              <p className="text-main/70 text-sm mb-3">
                Primarily from vehicle exhaust and power plants. High levels indicate heavy traffic or
                industrial activity. Contributes to respiratory problems and smog formation.
              </p>
              <div className="pt-3 wf-divider">
                <p className="text-xs text-main/60">1-hour Standard</p>
                <p className="text-xl font-bold text-accent">≤ 100 ppb</p>
              </div>
            </Card>

            <Card>
              <h3 className="font-bold text-main mb-2">Sulfur Dioxide (SO₂)</h3>
              <p className="text-main/70 text-sm mb-3">
                From burning fossil fuels, especially coal. Causes acid rain and respiratory issues.
                Levels have dropped dramatically since the Clean Air Act&apos;s acid rain program.
              </p>
              <div className="pt-3 wf-divider">
                <p className="text-xs text-main/60">1-hour Standard</p>
                <p className="text-xl font-bold text-accent">≤ 75 ppb</p>
              </div>
            </Card>
          </div>

          <AlertBox variant="info">
            <p className="text-alert-info text-sm">
              <strong>Check Your Air:</strong> Visit{' '}
              <a href="https://www.airnow.gov/" target="_blank" rel="noopener noreferrer" className="underline">AirNow.gov</a>{' '}
              or{' '}
              <a href="https://openaq.org/" target="_blank" rel="noopener noreferrer" className="underline">OpenAQ</a>{' '}
              for real-time air quality data in your area and global comparisons.
            </p>
          </AlertBox>
        </section>

        {/* Section 3: Clean Water Act */}
        <section className="mb-14">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-main">Clean Water Act Metrics</h2>
            <p className="wf-label mt-1">Aquatic Health & Water Quality</p>
          </div>

          <Card variant="section" className="mb-6">
            <p className="text-main/80 leading-relaxed">
              The Clean Water Act&apos;s goal is to make all U.S. waters <strong>&quot;fishable and swimmable.&quot;</strong>
              Water quality is complex and varies by location and intended use. These metrics provide the
              most accessible snapshot of watershed health.
            </p>
          </Card>

          {/* Water Quality Chart */}
          <div className="mb-6">
            <WaterQualityChart />
          </div>

          {/* Metric Cards */}
          <div className="grid md:grid-cols-3 gap-4 mb-6">
            <Card>
              <h3 className="font-bold text-main mb-2">Impaired Waters</h3>
              <p className="text-main/70 text-sm mb-3">
                Percentage of water bodies failing to meet quality standards for their intended use
                (drinking, swimming, fishing, etc.).
              </p>
              <div className="pt-3 wf-divider">
                <p className="text-xs text-main/60">Goal</p>
                <p className="text-xl font-bold text-accent">0%</p>
                <p className="text-xs text-main/60 mt-1">Current U.S. avg: ~50% impaired</p>
              </div>
            </Card>

            <Card>
              <h3 className="font-bold text-main mb-2">Nutrient Loading</h3>
              <p className="text-main/70 text-sm mb-3">
                Nitrogen & Phosphorus levels (mg/L). Main cause of &quot;Dead Zones&quot; and toxic algae blooms.
                Often from agricultural runoff.
              </p>
              <div className="pt-3 wf-divider">
                <p className="text-xs text-main/60">Total Phosphorus Limit</p>
                <p className="text-xl font-bold text-accent">≤ 0.1 mg/L</p>
                <p className="text-xs text-main/60 mt-1">(varies by water body type)</p>
              </div>
            </Card>

            <Card>
              <h3 className="font-bold text-main mb-2">Dissolved Oxygen (DO)</h3>
              <p className="text-main/70 text-sm mb-3">
                Fish and aquatic life need oxygen. Low DO levels indicate ecosystem collapse, often
                caused by nutrient pollution and algae die-offs.
              </p>
              <div className="pt-3 wf-divider">
                <p className="text-xs text-main/60">Healthy Level</p>
                <p className="text-xl font-bold text-accent">≥ 5 mg/L</p>
                <p className="text-xs text-main/60 mt-1">Below 2 mg/L = &quot;Dead Zone&quot;</p>
              </div>
            </Card>
          </div>

          <AlertBox variant="info">
            <p className="text-alert-info text-sm">
              <strong>Check Your Water:</strong> Use the EPA&apos;s{' '}
              <a href="https://mywaterway.epa.gov/" target="_blank" rel="noopener noreferrer" className="underline">How&apos;s My Waterway</a>{' '}
              app to enter any zip code and see the health of your local watershed.
            </p>
          </AlertBox>
        </section>

        {/* Section 4: Biodiversity */}
        <section className="mb-14">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-main">Living Planet Index</h2>
            <p className="wf-label mt-1">Biodiversity & Ecosystem Health</p>
          </div>

          <Card variant="section" className="mb-6">
            <p className="text-main/80 leading-relaxed mb-4">
              The <strong>Living Planet Index (LPI)</strong> tracks the average change in population size of
              thousands of vertebrate species worldwide. It&apos;s increasingly used alongside climate metrics
              because <em>climate change isn&apos;t just about heat—it&apos;s about the collapse of biological systems
              that support human life.</em>
            </p>
            <p className="text-main/80 leading-relaxed">
              A declining LPI suggests that even if we meet &quot;Net Zero&quot; carbon goals, we may still be losing
              the &quot;infrastructure&quot; of nature—pollinators, food chains, and ecosystem services we depend on.
            </p>
          </Card>

          <Card className="mb-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="font-bold text-main text-lg mb-1">Global Living Planet Index</h3>
                <p className="text-main/70 text-sm">Average vertebrate population change since 1970</p>
              </div>
              <div className="text-center md:text-right">
                <p className="text-4xl font-bold text-alert-warning">-69%</p>
                <p className="text-xs text-main/60">as of 2022 report</p>
              </div>
            </div>
            <div className="mt-4 pt-4 wf-divider">
              <p className="text-main/70 text-sm">
                <strong>What this means:</strong> Wildlife populations have declined by an average of 69% in
                just 50 years. Freshwater species (-83%) and tropical regions are hit hardest.
              </p>
            </div>
          </Card>

          <AlertBox variant="good">
            <p className="text-alert-good text-sm">
              <strong>Source:</strong> WWF{' '}
              <a href="https://livingplanet.panda.org/" target="_blank" rel="noopener noreferrer" className="underline">Living Planet Report</a>{' '}
              — Updated every two years with data from the Zoological Society of London.
            </p>
          </AlertBox>
        </section>

        {/* Why These Metrics Matter */}
        <Card as="section" variant="section" className="mb-12">
          <h2 className="text-2xl font-bold text-main mb-4">Why Track These Metrics?</h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h3 className="font-semibold text-main mb-2">Accountability</h3>
              <p className="text-main/80 text-sm">
                Metrics create measurable goals. Without numbers, it&apos;s impossible to know if policies are working
                or if leaders are keeping their promises.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-main mb-2">Early Warning</h3>
              <p className="text-main/80 text-sm">
                Trends in these metrics can warn us of problems before they become crises—allowing time for
                policy interventions.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-main mb-2">Informed Voting</h3>
              <p className="text-main/80 text-sm">
                Understanding the data helps you evaluate candidates&apos; environmental claims and hold elected
                officials accountable.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-main mb-2">Global Context</h3>
              <p className="text-main/80 text-sm">
                Climate change is global. These metrics let you compare your country&apos;s progress against
                international goals and other nations.
              </p>
            </div>
          </div>
        </Card>

        {/* CTA */}
        <Card as="section" variant="section" className="mb-12 p-8 text-center">
          <h2 className="text-2xl font-bold text-main mb-4">Take Action</h2>
          <p className="text-main/80 mb-6 max-w-2xl mx-auto">
            Your representatives vote on climate policy, EPA funding, and environmental regulations.
            Find out who represents you and how they&apos;ve voted on environmental issues.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              as="a"
              variant="active"
              href="/representatives"
              className="px-6 py-3 font-semibold"
            >
              Find Your Representatives
            </Button>
            <Button
              as="a"
              href="/environmental-protection"
              className="px-6 py-3 font-semibold"
            >
              Environmental Law Basics
            </Button>
          </div>
        </Card>

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

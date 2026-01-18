'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'

const navItems = [
  { name: 'Home', href: '/' },
  { name: 'My Representatives', href: '/my_rep' },
  { name: 'Policy Radar', href: '/graph' },
  { name: 'Search', href: '/search' },
]

export default function Navbar() {
  const pathname = usePathname()
  const [theme, setTheme] = useState<'light' | 'dark'>('dark')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    // Check for saved preference, default to dark mode
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null

    if (savedTheme) {
      setTheme(savedTheme)
      document.documentElement.classList.toggle('dark', savedTheme === 'dark')
    } else {
      // Default to dark mode
      setTheme('dark')
      document.documentElement.classList.add('dark')
    }
  }, [])

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light'
    setTheme(newTheme)
    localStorage.setItem('theme', newTheme)
    document.documentElement.classList.toggle('dark', newTheme === 'dark')
  }

  return (
    <nav className="w-full bg-nav shadow-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-white font-semibold text-xl" style={{ marginLeft: '-150px' }}>
            <img src="/EcoGlass.png" alt="EcoGlass" className="w-24 h-24" />
            EcoGlass
          </Link>

          <div className="flex items-center gap-3">
            {navItems.map((item) => {
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`
                    px-5 py-2.5 rounded-xl font-medium text-sm
                    transition-all duration-200 ease-out
                    ${isActive
                      ? 'bg-white text-accent shadow-[inset_0_2px_4px_rgba(0,0,0,0.15),inset_0_-2px_4px_rgba(255,255,255,0.9)]'
                      : 'text-white/90 hover:bg-white/20 hover:text-white shadow-[inset_0_2px_4px_rgba(0,0,0,0.2),inset_0_-2px_4px_rgba(255,255,255,0.1)]'
                    }
                  `}
                >
                  {item.name}
                </Link>
              )
            })}

            {/* Dark Mode Toggle */}
            <button
              onClick={toggleTheme}
              className="p-2.5 rounded-xl text-white/90 hover:bg-white/20 hover:text-white transition-all duration-200 ease-out shadow-[inset_0_2px_4px_rgba(0,0,0,0.2),inset_0_-2px_4px_rgba(255,255,255,0.1)]"
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {mounted && theme === 'dark' ? (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
    </nav>
  )
}

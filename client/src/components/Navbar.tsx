'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const navItems = [
  { name: 'Home', href: '/' },
  { name: 'My Representatives', href: '/my_rep' },
  { name: 'Graph', href: '/graph' },
  { name: 'News', href: '/news' },
  { name: 'Search', href: '/search' },
]

export default function Navbar() {
  const pathname = usePathname()

  return (
    <nav className="w-full bg-[#FAF9F6] shadow-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          <Link href="/" className="text-[#3D6B4B] font-semibold text-xl">
            EcoTransparency
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
                      ? 'bg-[#5A9F68] text-white shadow-md' 
                      : 'bg-[#E8F5E9] text-[#3D6B4B] hover:bg-[#5A9F68] hover:text-white hover:shadow-md hover:scale-105'
                    }
                  `}
                >
                  {item.name}
                </Link>
              )
            })}
          </div>
        </div>
      </div>
    </nav>
  )
}

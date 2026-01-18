import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import Navbar from '@/components/Navbar'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})

export const metadata: Metadata = {
  title: 'EcoGlass',
  description: 'CruzHacks 2026 - EcoGlass Project',
  icons: {
    icon: '/EcoGlass.png',
    apple: '/EcoGlass.png',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased bg-main`}>
        <Navbar />
        {children}
      </body>
    </html>
  )
}

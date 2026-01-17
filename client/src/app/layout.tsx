import type { Metadata } from 'next'
import { Quicksand } from 'next/font/google'
import Navbar from '@/components/Navbar'
import './globals.css'

const quicksand = Quicksand({ 
  subsets: ['latin'],
  variable: '--font-quicksand',
})

export const metadata: Metadata = {
  title: 'Environmental Transparency',
  description: 'CruzHacks 2026 - Environmental Transparency Project',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={`${quicksand.variable} font-sans antialiased bg-[#5A9F68]`}>
        <Navbar />
        {children}
      </body>
    </html>
  )
}

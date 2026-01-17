'use client'

import React, { useState } from 'react'
import Link from 'next/link'

interface ImageCardProps {
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
  buttonText?: string
  buttonLink?: string
}

export default function ImageCard({
  children,
  className = '',
  style = {},
  buttonText = 'Learn More',
  buttonLink = '/legislative-process',
}: ImageCardProps) {
  const [isHovered, setIsHovered] = useState(false)

  return (
    <div
      className={`relative overflow-hidden transition-all duration-300 ease-out bg-card ${className}`}
      style={{
        transform: isHovered ? 'scale(1.02)' : 'scale(1)',
        zIndex: isHovered ? 10 : 1,
        boxShadow: isHovered ? '0 20px 40px rgba(0,0,0,0.15)' : 'none',
        ...style,
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {children}

      {/* Hover Button Overlay */}
      <div
        className={`
          absolute inset-0 flex items-center justify-center
          bg-black/20 backdrop-blur-[2px]
          transition-all duration-300 ease-out
          ${isHovered ? 'opacity-100' : 'opacity-0 pointer-events-none'}
        `}
      >
        <Link
          href={buttonLink}
          className={`
            px-6 py-3 bg-accent text-white rounded-xl font-semibold
            shadow-lg hover:bg-accent-dark hover:shadow-xl
            transition-all duration-200
            transform ${isHovered ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}
          `}
          style={{ transitionDelay: isHovered ? '100ms' : '0ms' }}
        >
          {buttonText}
        </Link>
      </div>
    </div>
  )
}

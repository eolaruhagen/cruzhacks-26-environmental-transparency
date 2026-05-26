'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'

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
      className={`relative overflow-hidden transition-all duration-300 ease-out ${className}`}
      style={{
        transform: isHovered ? 'scale(1.02)' : 'scale(1)',
        zIndex: isHovered ? 10 : 1,
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
          bg-overlay backdrop-blur-[2px]
          transition-all duration-300 ease-out
          ${isHovered ? 'opacity-100' : 'opacity-0 pointer-events-none'}
        `}
      >
        <Button
          as={Link}
          variant="active"
          href={buttonLink}
          className={`
            px-6 py-3 font-semibold
            transition-all duration-200
            transform ${isHovered ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}
          `}
          style={{ transitionDelay: isHovered ? '100ms' : '0ms' }}
        >
          {buttonText}
        </Button>
      </div>
    </div>
  )
}

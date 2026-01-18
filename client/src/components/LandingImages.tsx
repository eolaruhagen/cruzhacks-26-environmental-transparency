'use client'

import React from 'react'
import Image from 'next/image'
import ImageCard from './ImageCard'

export default function LandingImages() {
  return (
    <section className="w-full md:w-[60%] flex flex-col">
      {/* Image 1 - US House */}
      <ImageCard
        className="relative border-b border-border"
        buttonText="Legislative Process"
        buttonLink="/legislative-process"
      >
        <Image
          src="/images/USHouse-photo.avif"
          alt="US House of Representatives"
          width={1200}
          height={800}
          className="w-full h-auto object-cover"
          priority
        />
      </ImageCard>

      {/* Image 2 - Yosemite */}
      <ImageCard
        className="relative border-b border-border"
        buttonText="Environmental Protection"
        buttonLink="/environmental-protection"
      >
        <Image
          src="/images/Yosemite.jpg"
          alt="Yosemite National Park"
          width={1200}
          height={800}
          className="w-full h-auto object-cover"
        />
      </ImageCard>

      {/* Image 3 - Executive Cabinet */}
      <ImageCard
        className="relative border-b border-border"
        buttonText="Executive Actions"
        buttonLink="/executive-branch"
      >
        <Image
          src="/images/executivecab.jpg"
          alt="Executive Cabinet"
          width={1200}
          height={800}
          className="w-full h-auto object-cover"
        />
      </ImageCard>

      {/* Image 4 - Florida Keys */}
      <ImageCard
        className="relative"
        buttonText="Climate Impact"
        buttonLink="/climate-impact"
      >
        <Image
          src="/images/Florida-Keys.jpg"
          alt="Florida Keys"
          width={1200}
          height={800}
          className="w-full h-auto object-cover"
        />
      </ImageCard>
    </section>
  )
}

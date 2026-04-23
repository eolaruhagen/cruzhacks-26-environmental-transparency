import React from 'react'
import Link from 'next/link'
import Image from 'next/image'


export function PageNavCard({ title, description, href, icon }: {
    title: string
    description: string
    href: string
    icon: React.ReactNode
}) {
    return (
        <Link href={href} className="block wf-card group">
            <div className="flex items-start gap-4">
                <div className="w-10 h-10 flex items-center justify-center shrink-0">
                    {icon}
                </div>
                <div>
                    <h3 className="font-semibold text-main mb-1">{title}</h3>
                    <p className="text-sm text-light leading-relaxed">
                        {description}
                    </p>
                </div>
            </div>
        </Link>
    )
}


export interface BentoFeatureItem {
    href: string
    title: string
    description: string
    iconPath: string
}

export interface BentoImageItem {
    href: string
    caption: string
    src: string
    alt: string
}

export function BentoFeatureCard({
    feature,
    spanClass = '',
}: {
    feature: BentoFeatureItem
    spanClass?: string
}) {
    return (
        <Link
            href={feature.href}
            className={`wf-glass-card wf-shadow group flex flex-col h-full ${spanClass}`}
        >
            <svg
                className="w-5 h-5 text-accent mb-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
            >
                <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d={feature.iconPath}
                />
            </svg>
            <h3 className="font-semibold text-main mb-1 group-hover:text-accent transition-colors">
                {feature.title}
            </h3>
            <p className="text-sm text-light leading-relaxed">
                {feature.description}
            </p>
        </Link>
    )
}

export function BentoImageCard({
    item,
    spanClass = '',
}: {
    item: BentoImageItem
    spanClass?: string
}) {
    return (
        <Link
            href={item.href}
            className={`group relative block overflow-hidden border border-border wf-shadow h-64 md:h-auto ${spanClass}`}
        >
            <Image
                src={item.src}
                alt={item.alt}
                fill
                sizes="(max-width: 768px) 100vw, (max-width: 1024px) 66vw, 640px"
                className="object-cover transition-transform duration-300 group-hover:scale-105"
            />
            <div
                className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent"
                aria-hidden="true"
            />
            <div className="absolute inset-0 flex items-end p-4">
                <div>
                    <p className="wf-label text-white/80 mb-1">Explore</p>
                    <p className="text-white font-semibold text-lg leading-tight">
                        {item.caption}
                    </p>
                </div>
            </div>
        </Link>
    )
}

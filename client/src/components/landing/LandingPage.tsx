import React from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Card } from '@/components/ui/Card'


export function PageNavCard({ title, description, href, icon }: {
    title: string
    description: string
    href: string
    icon: React.ReactNode
}) {
    return (
        <Card as={Link} href={href} className="block group">
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
        </Card>
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
    prominent = false,
}: {
    feature: BentoFeatureItem
    spanClass?: string
    /** When true, card uses larger icon, title, body text, and padding for hierarchy. */
    prominent?: boolean
}) {
    const padding = prominent ? '!p-7' : ''
    const iconClass = prominent ? 'w-8 h-8 mb-5' : 'w-5 h-5 mb-3'
    const titleClass = prominent ? 'text-xl mb-2' : 'mb-1'
    const descClass = prominent ? 'text-base' : 'text-sm'

    return (
        <Card
            as={Link}
            variant="glass-card"
            href={feature.href}
            className={`group flex flex-col h-full ${padding} ${spanClass}`}
        >
            <svg
                className={`text-accent ${iconClass}`}
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
            <h3 className={`font-semibold text-main group-hover:text-accent transition-colors ${titleClass}`}>
                {feature.title}
            </h3>
            <p className={`${descClass} text-light leading-relaxed`}>
                {feature.description}
            </p>
        </Card>
    )
}

export function BentoImageCard({
    item,
    spanClass = '',
    compact = false,
}: {
    item: BentoImageItem
    spanClass?: string
    /** When true, fixed shorter height, smaller caption — for de-emphasized rows. */
    compact?: boolean
}) {
    const heightClass = compact ? 'h-44 md:!h-48' : 'h-64 md:h-auto'
    const captionClass = compact ? 'text-base' : 'text-lg'

    return (
        <Link
            href={item.href}
            className={`group relative block overflow-hidden border border-border transition-colors hover:border-accent ${heightClass} ${spanClass}`}
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
                    <p className={`text-white font-semibold leading-tight ${captionClass}`}>
                        {item.caption}
                    </p>
                </div>
            </div>
        </Link>
    )
}

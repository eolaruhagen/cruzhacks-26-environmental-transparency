import React from 'react'
import Link from 'next/link'

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
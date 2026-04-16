import React from 'react'

export function PageNavCard({ title, description, href, icon }: {
    title: string
    description: string
    href: string
    icon: React.ReactNode
}) {
    return (
        <a href={href} className="block p-4 rounded-xl bg-card hover:bg-card-hover transition-all duration-200 group">
            <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-accent/20 flex items-center justify-center shrink-0 group-hover:bg-accent/30 transition-colors">
                    {icon}
                </div>
                <div>
                    <h3 className="font-semibold text-main mb-1">{title}</h3>
                    <p className="text-sm text-light leading-relaxed">
                        {description}
                    </p>
                </div>
            </div>
        </a>
    )
}
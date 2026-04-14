'use client'

export type ResultItemBadge = {
    label: string
    className?: string // tailwind classes for bg, text color, etc.
}

type ResultMetadataLine = {
    label: string,
    value: string | React.ReactNode
    clamp?: boolean // specifies to use line-clamp-1 to show ellipsis (allows for hover based content)
}

interface SearchCardShellProps {
    title: string
    alias?: string // alias used for things like bill numbers etc.
    badges: ResultItemBadge[]
    metadata: ResultMetadataLine[]
    date?: string
    sourceIconUrl?: string
}


export interface BillSearchResultProps {
    bill: {
        id: string
        legislation_number: string
        title: string
        url: string
        category: string | null
        latest_action: string | null
        latest_tracker_stage: string | null
        // Optional: only shown in full search context, not in MyRep
        sponsor?: string
        party_of_sponsor?: string
        date_of_introduction?: string
        compact?: boolean
        dropSponsor?: boolean
    }
}

export function BillSearchResult({ bill }: BillSearchResultProps) {
    const alias = bill.legislation_number
    const { title } = bill
    const date = bill.date_of_introduction
    const badges: ResultItemBadge[] = [
        { label: bill.category ?? 'Unknown Category', className: 'bg-blue-500/10 text-blue-500' },
        { label: bill.latest_tracker_stage ?? 'Unknown Stage', className: 'bg-green-500/10 text-green-500' },
    ]

    const getPartyColor = (party: string) => {
        if (party.toLowerCase().includes('democrat')) return 'text-blue-600';
        if (party.toLowerCase().includes('republican')) return 'text-red-600';
        return 'text-gray-600';
    };

    const coloredSponsorName = bill.sponsor ? (
        <span className={getPartyColor(bill.party_of_sponsor ?? '')}>
            {bill.sponsor}
        </span>
    ) : 'Unknown sponsor'
    let metadata: ResultMetadataLine[] = [
        { label: 'Latest Action', value: bill.latest_action ?? 'Cannot find latest action', clamp: bill.compact },
        { label: 'Sponsor', value: coloredSponsorName, clamp: bill.compact },
        { label: 'Party of Sponsor', value: bill.party_of_sponsor ?? 'Unknown party', clamp: bill.compact },
    ]

    if (bill.dropSponsor) {
        metadata = metadata.filter(meta => meta.label !== 'Sponsor' && meta.label !== 'Party of Sponsor')
    }


    return (
        <a href={bill.url} target="_blank" rel="noopener noreferrer">
            <SearchCardShell
                title={title}
                alias={alias}
                date={date}
                badges={badges}
                metadata={metadata}
            />
        </a>
    )
}

interface ArticleSearchResultProps {
    article: {
        // From artifacts table
        id: string
        url: string
        source_icon_url: string | null
        published_at: string | null
        // From article_details table
        title: string
        description: string | null
        source: string | null
        author: string[] | null
        topics: string[] | null
        // From artifact_enrichments table
        summary: string
        environmental_topic: string
        impact_level: 'local' | 'state' | 'national' | 'international'
        sentiment: number
        key_quote: string | null
        associated_bills: { legislation_number: string; congress: string }[] | null
        associated_representatives: string[] | null
    }
}

export function ArticleSearchResult({ article }: ArticleSearchResultProps) { }


export function SearchCardShell({ title, alias, date, badges, metadata, sourceIconUrl }: SearchCardShellProps) {
    return (
        <div className="block p-5 rounded-xl bg-card hover:bg-card-hover transition-all duration-200 group">
            <div className="flex items-center gap-2">
                {sourceIconUrl && (
                    <img src={sourceIconUrl} alt="" className="w-4 h-4 rounded-full shrink-0" />
                )}
                {alias && (
                    <span className="text-sm font-mono font-semibold text-accent whitespace-nowrap shrink-0">
                        {alias}
                    </span>
                )}
                <div className="flex gap-1.5 overflow-x-auto scrollbar-hide min-w-0">
                    {badges.map((badge, index) => (
                        <ResultItemBadge key={index} label={badge.label} className={badge.className} />
                    ))}
                </div>
                {date && (
                    <span className="text-xs text-light whitespace-nowrap shrink-0 ml-auto">
                        {date}
                    </span>
                )}
            </div>

            <h3 title={title} className="font-semibold text-main mt-2 line-clamp-2 group-hover:text-accent transition-colors">
                {title}
            </h3>

            {metadata.length > 0 && (
                <div className="mt-2 space-y-1">
                    {metadata.map((meta, index) => (
                        <p key={index} className={`text-sm text-light ${meta.clamp ? 'line-clamp-1' : ''}`}>
                            <span className="font-medium">{meta.label}:</span>{' '}
                            {meta.value}
                        </p>
                    ))}
                </div>
            )}
        </div>
    )
}

export function ResultItemBadge({ label, className }: ResultItemBadge) {
    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap shrink-0 ${className ?? ''}`}>
            {label}
        </span>
    )
}


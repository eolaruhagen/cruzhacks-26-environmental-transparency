'use client'

import { supabase } from "@/lib/supabase"
import { useCallback, useEffect, useState } from "react"
import { Database } from "../../../../supabase/functions/database.types"
import { Bill, BillType } from "@/lib/types"
import { formatBillCategory, formatTzDate } from "@/lib/utils"

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
    expanded?: boolean       // controls expand/collapse animation
    children?: React.ReactNode  // content rendered in the expandable area
}



export interface BillSearchResultProps {
    bill: Bill
    reason?: string
    compact?: boolean
    dropSponsor?: boolean
}

export function BillSearchResult({ bill, reason, compact, dropSponsor }: BillSearchResultProps) {
    const alias = bill.legislation_number
    const { title } = bill
    const date = formatTzDate(bill.date_of_introduction)
    const badges: ResultItemBadge[] = [
        { label: formatBillCategory(bill.category), className: 'bg-blue-500/10 text-blue-500' },
        {
            label: bill.latest_tracker_stage ?? 'Unknown Stage',
            className: bill.latest_tracker_stage
                ? 'bg-green-500/10 text-green-500'
                : 'bg-gray-500/10 text-gray-500',
        },
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
        { label: 'Latest Action', value: bill.latest_action ?? 'Cannot find latest action', clamp: compact },
        { label: 'Sponsor', value: coloredSponsorName, clamp: compact },
    ]

    if (dropSponsor) {
        metadata = metadata.filter(meta => meta.label !== 'Sponsor')
    }

    if (reason) {
        metadata.push({ label: 'Reason', value: reason, clamp: false })
    }


    return (
        <a href={bill.url} target="_blank" rel="noopener noreferrer" className="block">
            <SearchCardShell
                title={title}
                alias={alias}
                date={date ?? undefined}
                badges={badges}
                metadata={metadata}
            />
        </a>
    )
}

export interface ArticleSearchResultProps {
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
        environmental_topic: BillType
        impact_level: 'local' | 'state' | 'national' | 'international'
        sentiment: number
        key_quote: string | null
        associated_bills: { legislation_number: string; reason: string }[] | null
        associated_representatives: string[] | null
    }
}


export function SearchCardShell({ title, alias, date, badges, metadata, sourceIconUrl, expanded, children }: SearchCardShellProps) {
    return (
        <div className="wf-card block group">
            <div className="flex items-center gap-2">
                {sourceIconUrl && (
                    <img src={sourceIconUrl} alt="" className="w-4 h-4  shrink-0" />
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
                    <span className="text-xs font-mono text-light whitespace-nowrap shrink-0 ml-auto">
                        {date}
                    </span>
                )}
            </div>

            <h3 title={title} className="font-semibold text-main mt-3 line-clamp-2 group-hover:text-accent transition-colors">
                {title}
            </h3>

            {metadata.length > 0 && (
                <div className="mt-3 space-y-1">
                    {metadata.map((meta, index) => (
                        <p key={index} className={`text-sm text-light ${meta.clamp ? 'line-clamp-1' : ''}`}>
                            <span className="wf-label">{meta.label}:</span>{' '}
                            {meta.value}
                        </p>
                    ))}
                </div>
            )}

            {/* Expandable area — slides open/closed via CSS Grid row transition */}
            {children && (
                <div className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                    <div className="overflow-hidden">
                        <div className="wf-divider pt-4 mt-4">
                            {children}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}


// similar to bill search result, but allows expanding the component down to show more information.
export function ArticleSearchResult({ article }: ArticleSearchResultProps) {
    const [collapsed, setCollapsed] = useState(true)

    const { title, description, source, author, topics, summary, environmental_topic, impact_level, sentiment, key_quote, associated_bills, associated_representatives } = article
    const date = formatTzDate(article.published_at)
    const sourceIconUrl = article.source_icon_url
    let badges: ResultItemBadge[] = [
        { label: formatBillCategory(article.environmental_topic), className: 'bg-blue-500/10 text-blue-500' },
        { label: article.impact_level ?? 'Unknown Impact Level', className: 'bg-green-500/10 text-green-500' },
        { label: article.sentiment > 0 ? 'Positive' : 'Negative', className: article.sentiment > 0 ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500' },
    ]

    if (article.topics) {
        badges = [...badges, ...article.topics.map((topic) => ({ label: topic, className: 'bg-blue-500/10 text-blue-500' }))]
    }
    const metadata: ResultMetadataLine[] = [
        { label: 'Source', value: article.source ?? 'Unknown source', clamp: true },
        { label: 'Author', value: article.author?.join(', ') ?? 'Unknown author', clamp: true },
    ]
    return (
        <div onClick={() => setCollapsed(!collapsed)} className="cursor-pointer">
            <SearchCardShell
                title={title}
                date={date ?? undefined}
                badges={badges}
                metadata={metadata}
                sourceIconUrl={sourceIconUrl ?? undefined}
                expanded={!collapsed}
            >
                {/* Expanded content — shown when card is clicked */}
                <div className="space-y-4">
                    {/* Summary block — visually distinct */}
                    <div className="space-y-3">
                        <p className="text-xs font-semibold text-light/70 uppercase tracking-wide mb-1">Summary</p>
                        <p className="text-sm text-main leading-relaxed">{summary}</p>

                        {key_quote && (
                            <blockquote className="text-sm italic text-light border-l-2 border-accent pl-3">
                                &ldquo;{key_quote}&rdquo;
                            </blockquote>
                        )}
                    </div>

                    {!collapsed && <ArticleSearchResultExpansion article={article} />}

                    <a
                        href={article.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:text-accent-dark transition-colors pt-1"
                    >
                        Read full article
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                    </a>
                </div>
            </SearchCardShell>
        </div>
    )
}

function ArticleSearchResultExpansion({ article }: ArticleSearchResultProps) {
    const [relatedBills, setRelatedBills] = useState<{ reason: string, bill: BillSearchResultProps }[]>([])

    // fetch related bills via the supabase postgrest (house bills on the public schema)
    // TODO: this is totally unsafe type checks right now (runtime could totally just throw)
    const fetchRelatedBills = useCallback(async () => {
        const relatedBillIds = article.associated_bills?.map((bill) => bill.legislation_number)
        if (!relatedBillIds) {
            return
        }
        const { data, error } = await supabase
            .from('house_bills')
            .select('id, legislation_number, title, sponsor, party_of_sponsor, category, url, latest_action, latest_tracker_stage, date_of_introduction')
            .in('legislation_number', relatedBillIds)
        if (error) {
            console.error('Error fetching related bills:', error)
            return
        }
        setRelatedBills(data.map((bill) => {
            const reason = article.associated_bills?.find((b) => b.legislation_number === bill.legislation_number)?.reason
            return { reason: reason ?? 'Associated Bill', bill: transformBillToSearchProps(bill) }
        }))
    }, [article.associated_bills])

    useEffect(() => {
        fetchRelatedBills()
    }, [fetchRelatedBills])

    return (
        <div>
            {relatedBills.length !== 0 ? (
                <div>
                    <p className="text-xs font-semibold text-light/70 uppercase tracking-wide mb-2">Associated Bills</p>
                    <div className="flex flex-col gap-2 max-h-[30vh] overflow-y-auto scrollbar-hide px-1.5">
                        {relatedBills.map((relatedBill) => (
                            <BillSearchResult key={relatedBill.bill.bill.id} bill={{ ...relatedBill.bill.bill }} reason={relatedBill.reason} compact={true} />
                        ))}
                    </div>
                </div>
            ) : (
                <p className="text-sm text-light/60">No associated bills found</p>
            )}
        </div>
    )
}

export function ResultItemBadge({ label, className }: ResultItemBadge) {
    return (
        <span className={`wf-badge shrink-0 ${className ?? ''}`}>
            {label}
        </span>
    )
}

/// All helpers down here -- not sure where to put them yet...


/** 
 * transforms a bill from the database schema to the search result props schema
 * - Doesn't assign `compact` or `expanded` props
  */
function transformBillToSearchProps(bill: Pick<Database['public']['Tables']['house_bills']['Row'], 'id' | 'legislation_number' | 'title' | 'sponsor' | 'party_of_sponsor' | 'category' | 'url' | 'latest_action' | 'latest_tracker_stage' | 'date_of_introduction'>): BillSearchResultProps {
    return {
        bill: {
            id: bill.id,
            title: bill.title,
            legislation_number: bill.legislation_number,
            sponsor: bill.sponsor,
            party_of_sponsor: bill.party_of_sponsor,
            category: bill.category,
            url: bill.url,
            latest_action: bill.latest_action,
            latest_tracker_stage: bill.latest_tracker_stage,
            date_of_introduction: bill.date_of_introduction
        },
    }
}
import 'server-only'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../../../packages/shared/src/database.types'
import type { BillWithScores, Subcategory, RadarBill } from '@/lib/types'

export async function getGraphBills(): Promise<{
  bills: BillWithScores[]
  subcategories: Subcategory[]
}> {
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )

  const CHUNK_SIZE = 1000
  const rawBills: RadarBill[] = []
  let offset = 0

  while (true) {
    const { data, error } = await supabase
      .from('house_bills')
      .select('legislation_number, category, subcategory_scores, title, url, date_of_introduction')
      .not('subcategory_scores', 'is', null)
      .range(offset, offset + CHUNK_SIZE - 1)

    if (error) throw error
    if (!data || data.length === 0) break

    rawBills.push(...(data as unknown as RadarBill[]))
    if (data.length < CHUNK_SIZE) break
    offset += CHUNK_SIZE
  }

  const bills: BillWithScores[] = rawBills
    .filter(b => b.category && b.subcategory_scores)
    .map(b => {
      let introductionYear: number | null = null
      if (b.date_of_introduction) {
        const year = new Date(b.date_of_introduction).getFullYear()
        if (!isNaN(year)) introductionYear = year
      }
      return {
        legislation_number: b.legislation_number,
        category: b.category,
        title: b.title || b.legislation_number,
        url: b.url || '',
        subcategoryScores: b.subcategory_scores as Record<string, number>,
        introductionYear,
      }
    })

  const { data: subcatData, error: subcatError } = await supabase
    .from('categories_embeddings')
    .select('subcategory, bill_type, embedding')

  if (subcatError) throw subcatError

  const parseEmbedding = (embedding: string | number[] | null): number[] => {
    if (Array.isArray(embedding)) return embedding
    if (typeof embedding === 'string') {
      try {
        return JSON.parse(embedding)
      } catch {
        return []
      }
    }
    return []
  }

  const subcategories: Subcategory[] = (subcatData ?? []).map(s => ({
    subcategory: s.subcategory,
    bill_type: s.bill_type,
    embedding: parseEmbedding(s.embedding as unknown as string | number[] | null),
  }))

  return { bills, subcategories }
}

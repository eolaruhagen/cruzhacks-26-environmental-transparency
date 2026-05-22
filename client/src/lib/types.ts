import { Database } from '../../../packages/shared/src/database.types'

export type { Database }


export type BillType = Database['public']['Enums']['bill_type']

export type HouseBillRow = Database['public']['Tables']['house_bills']['Row']


export interface Bill {
    id: string;
    legislation_number: string;
    title: string;
    sponsor: string;
    party_of_sponsor: string;
    category: BillType | null;
    url: string;
    latest_action: string;
    latest_tracker_stage: string;
    date_of_introduction: string | null;
}

export type RepBill = Pick<Bill, 'id' | 'legislation_number' | 'title' | 'url' | 'latest_action' | 'category' | 'date_of_introduction'>

export interface RadarBill {
    legislation_number: string;
    category: string;
    subcategory_scores: Record<string, number> | null;
    title: string;
    url: string;
    date_of_introduction?: string | null;
}

export interface BillWithScores {
    legislation_number: string;
    category: string;
    title: string;
    url: string;
    subcategoryScores: Record<string, number>;
    introductionYear: number | null;
}


export interface Subcategory {
    subcategory: string;
    bill_type: BillType;
    embedding: number[];
}

export interface Cluster {
    centroid: number[];
    bills: BillWithScores[];
    x: number;
    y: number;
}


export interface Representative {
    name: string;
    title: string;
    party: string;
    photoUrl: string;
    state: string;
    district?: string;
    url?: string;
    terms?: number;
}

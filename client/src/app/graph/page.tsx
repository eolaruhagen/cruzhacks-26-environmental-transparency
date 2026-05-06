import GraphClient from './graph_client';
import { getGraphBills } from '@/lib/data/graph-bills';

export const revalidate = 3600;

export default async function GraphPage() {
  const { bills, subcategories } = await getGraphBills();
  return <GraphClient bills={bills} subcategories={subcategories} />;
}

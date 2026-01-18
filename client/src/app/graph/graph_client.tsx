"use client"
import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import {
    RadarChart,
    PolarGrid,
    PolarAngleAxis,
    Radar,
    ResponsiveContainer,
    Tooltip
} from 'recharts';
import { kmeans } from 'ml-kmeans';

// Cluster interface
interface Cluster {
    centroid: number[];
    bills: BillWithScores[];
    x: number;
    y: number;
}

// Polar Scatter Chart Component
interface PolarScatterChartProps {
    bills: BillWithScores[];
    subcategoryNames: string[];
    numClusters?: number;
}

function PolarScatterChart({ bills, subcategoryNames, numClusters = 8 }: PolarScatterChartProps) {
    const [showClusters, setShowClusters] = useState(true);
    const [hoveredCluster, setHoveredCluster] = useState<number | null>(null);

    if (subcategoryNames.length === 0 || bills.length === 0) {
        return <div className="text-gray-500">No data to display</div>;
    }

    const size = 500;
    const center = size / 2;
    const radius = size * 0.4;

    // Convert bills to score vectors for clustering
    const scoreVectors = bills.map(bill =>
        subcategoryNames.map(subcat => bill.subcategoryScores[subcat] || 0)
    );

    // Calculate position for a score vector
    const getPosition = (scores: number[]) => {
        const n = subcategoryNames.length;
        let dirX = 0, dirY = 0;

        scores.forEach((score, i) => {
            const angle = (2 * Math.PI * i) / n - Math.PI / 2;
            dirX += score * Math.cos(angle);
            dirY += score * Math.sin(angle);
        });

        const dirMagnitude = Math.sqrt(dirX * dirX + dirY * dirY);
        if (dirMagnitude > 0) {
            dirX /= dirMagnitude;
            dirY /= dirMagnitude;
        }

        const maxScore = Math.max(...scores);
        const minScore = Math.min(...scores);
        const scoreRange = maxScore - minScore;
        const normalizedSpread = Math.min(scoreRange / 0.1, 1);
        const billRadius = radius * (0.3 + normalizedSpread * 0.6);

        return {
            x: center + dirX * billRadius,
            y: center + dirY * billRadius
        };
    };

    // Perform k-means clustering with cluster count based on data SPREAD (not amount)
    const clusters: Cluster[] = useMemo(() => {
        if (bills.length < 3) return [];

        // First, calculate all positions to measure spread
        const positions = bills.map(bill => {
            const scores = subcategoryNames.map(subcat => bill.subcategoryScores[subcat] || 0);
            return getPosition(scores);
        });

        // Calculate bounding box of all positions
        const minX = Math.min(...positions.map(p => p.x));
        const maxX = Math.max(...positions.map(p => p.x));
        const minY = Math.min(...positions.map(p => p.y));
        const maxY = Math.max(...positions.map(p => p.y));

        // Spread = area of bounding box relative to chart area
        const boundingArea = (maxX - minX) * (maxY - minY);
        const chartArea = size * size;
        const spreadRatio = boundingArea / chartArea; // 0 to 1

        // Low spread (compact data) = fewer clusters (2-4)
        // High spread (spread out data) = more clusters (6-12)
        const dynamicClusters = Math.max(2, Math.min(12, Math.round(2 + spreadRatio * 15)));

        console.log(`Spread ratio: ${spreadRatio.toFixed(3)}, Clusters: ${dynamicClusters}`);

        try {
            const result = kmeans(scoreVectors, dynamicClusters, {
                initialization: 'kmeans++',
                maxIterations: 100
            });

            // Group bills by cluster
            const clusterGroups: BillWithScores[][] = Array(dynamicClusters).fill(null).map(() => []);
            result.clusters.forEach((clusterIdx, billIdx) => {
                clusterGroups[clusterIdx].push(bills[billIdx]);
            });

            // Calculate cluster positions
            let rawClusters = result.centroids.map((centroid, i) => {
                const pos = getPosition(centroid);
                return {
                    centroid,
                    bills: clusterGroups[i],
                    x: pos.x,
                    y: pos.y
                };
            }).filter(c => c.bills.length > 0);

            // Merge overlapping clusters (only if within 25px - very close)
            const mergeDistance = 25;
            const mergedClusters: Cluster[] = [];
            const used = new Set<number>();

            for (let i = 0; i < rawClusters.length; i++) {
                if (used.has(i)) continue;

                let merged = { ...rawClusters[i], bills: [...rawClusters[i].bills] };

                for (let j = i + 1; j < rawClusters.length; j++) {
                    if (used.has(j)) continue;

                    const dx = rawClusters[i].x - rawClusters[j].x;
                    const dy = rawClusters[i].y - rawClusters[j].y;
                    const distance = Math.sqrt(dx * dx + dy * dy);

                    if (distance < mergeDistance) {
                        merged.bills = [...merged.bills, ...rawClusters[j].bills];
                        const totalBills = merged.bills.length;
                        merged.x = (merged.x * (totalBills - rawClusters[j].bills.length) + rawClusters[j].x * rawClusters[j].bills.length) / totalBills;
                        merged.y = (merged.y * (totalBills - rawClusters[j].bills.length) + rawClusters[j].y * rawClusters[j].bills.length) / totalBills;
                        used.add(j);
                    }
                }

                mergedClusters.push(merged);
                used.add(i);
            }

            // Split clusters if bills are too far from centroid (120px max)
            const maxDistFromCentroid = 120;
            const finalClusters: Cluster[] = [];

            for (const cluster of mergedClusters) {
                // Get visual positions of all bills in this cluster
                const billsWithPos = cluster.bills.map(bill => {
                    const scores = subcategoryNames.map(subcat => bill.subcategoryScores[subcat] || 0);
                    const pos = getPosition(scores);
                    const dx = pos.x - cluster.x;
                    const dy = pos.y - cluster.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    return { bill, pos, dist };
                });

                // Keep only bills within maxDistFromCentroid
                const closeBills = billsWithPos.filter(b => b.dist <= maxDistFromCentroid);
                const farBills = billsWithPos.filter(b => b.dist > maxDistFromCentroid);

                if (closeBills.length > 0) {
                    // Recalculate centroid for close bills
                    const avgX = closeBills.reduce((sum, b) => sum + b.pos.x, 0) / closeBills.length;
                    const avgY = closeBills.reduce((sum, b) => sum + b.pos.y, 0) / closeBills.length;
                    finalClusters.push({
                        ...cluster,
                        bills: closeBills.map(b => b.bill),
                        x: avgX,
                        y: avgY
                    });
                }

                // Far bills become their own clusters (if enough of them are close to each other)
                if (farBills.length >= 2) {
                    // Group far bills by proximity
                    const grouped: typeof billsWithPos[] = [];
                    const usedFar = new Set<number>();

                    for (let i = 0; i < farBills.length; i++) {
                        if (usedFar.has(i)) continue;
                        const group = [farBills[i]];
                        usedFar.add(i);

                        for (let j = i + 1; j < farBills.length; j++) {
                            if (usedFar.has(j)) continue;
                            const dx = farBills[i].pos.x - farBills[j].pos.x;
                            const dy = farBills[i].pos.y - farBills[j].pos.y;
                            if (Math.sqrt(dx * dx + dy * dy) < 50) {
                                group.push(farBills[j]);
                                usedFar.add(j);
                            }
                        }
                        grouped.push(group);
                    }

                    // Create clusters for groups with 2+ bills
                    for (const group of grouped) {
                        if (group.length >= 2) {
                            const gx = group.reduce((s, b) => s + b.pos.x, 0) / group.length;
                            const gy = group.reduce((s, b) => s + b.pos.y, 0) / group.length;
                            finalClusters.push({
                                centroid: [],
                                bills: group.map(b => b.bill),
                                x: gx,
                                y: gy
                            });
                        }
                    }
                }
            }

            // Final pass: merge clusters if their rendered circles overlap >40%
            const getClusterRadius = (billCount: number, maxBillCount: number) => {
                const minRadius = 15;
                const maxRadius = 50;
                return minRadius + (billCount / Math.max(maxBillCount, 1)) * (maxRadius - minRadius);
            };

            const maxBillCount = Math.max(...finalClusters.map(c => c.bills.length), 1);

            // Calculate overlap percentage between two circles
            const circleOverlap = (c1: Cluster, c2: Cluster): number => {
                const r1 = getClusterRadius(c1.bills.length, maxBillCount);
                const r2 = getClusterRadius(c2.bills.length, maxBillCount);
                const dx = c1.x - c2.x;
                const dy = c1.y - c2.y;
                const d = Math.sqrt(dx * dx + dy * dy);

                // No overlap
                if (d >= r1 + r2) return 0;
                // One inside the other
                if (d <= Math.abs(r1 - r2)) return 1;

                // Overlap area calculation (simplified)
                const overlapDist = (r1 + r2) - d;
                const smallerRadius = Math.min(r1, r2);
                return Math.min(overlapDist / (smallerRadius * 2), 1);
            };

            // Merge overlapping clusters
            const overlapThreshold = 0.4;
            const mergedFinal: Cluster[] = [];
            const usedFinal = new Set<number>();

            for (let i = 0; i < finalClusters.length; i++) {
                if (usedFinal.has(i)) continue;

                let merged = { ...finalClusters[i], bills: [...finalClusters[i].bills] };

                for (let j = i + 1; j < finalClusters.length; j++) {
                    if (usedFinal.has(j)) continue;

                    if (circleOverlap(merged, finalClusters[j]) > overlapThreshold) {
                        // Merge
                        const totalBills = merged.bills.length + finalClusters[j].bills.length;
                        merged.x = (merged.x * merged.bills.length + finalClusters[j].x * finalClusters[j].bills.length) / totalBills;
                        merged.y = (merged.y * merged.bills.length + finalClusters[j].y * finalClusters[j].bills.length) / totalBills;
                        merged.bills = [...merged.bills, ...finalClusters[j].bills];
                        usedFinal.add(j);
                    }
                }

                mergedFinal.push(merged);
                usedFinal.add(i);
            }

            return mergedFinal;
        } catch (e) {
            console.error('Clustering failed:', e);
            return [];
        }
    }, [bills, subcategoryNames]);

    // Individual bill positions
    const billPositions = bills.map(bill => {
        const scores = subcategoryNames.map(subcat => bill.subcategoryScores[subcat] || 0);
        const pos = getPosition(scores);
        return { ...pos, bill };
    });

    // Find extreme outliers - bills that are REALLY far from their cluster (>220px)
    // AND not close to any other cluster
    const extremeOutlierThreshold = 150;
    const nearClusterThreshold = 60; // If within 60px of ANY cluster, not an outlier

    const { finalClusters, extremeOutliers } = useMemo(() => {
        const outliers: typeof billPositions = [];
        const updatedClusters = clusters.map(cluster => {
            const keptBills: BillWithScores[] = [];

            cluster.bills.forEach(bill => {
                const billPos = billPositions.find(bp => bp.bill.legislation_number === bill.legislation_number);
                if (!billPos) return;

                const dx = billPos.x - cluster.x;
                const dy = billPos.y - cluster.y;
                const distanceToOwnCluster = Math.sqrt(dx * dx + dy * dy);

                if (distanceToOwnCluster > extremeOutlierThreshold) {
                    // Check if close to ANY cluster before marking as outlier
                    const isNearAnyCluster = clusters.some(c => {
                        const cdx = billPos.x - c.x;
                        const cdy = billPos.y - c.y;
                        const distToCluster = Math.sqrt(cdx * cdx + cdy * cdy);
                        return distToCluster < nearClusterThreshold;
                    });

                    if (!isNearAnyCluster) {
                        outliers.push(billPos);
                    } else {
                        keptBills.push(bill); // Near another cluster, keep it
                    }
                } else {
                    keptBills.push(bill);
                }
            });

            return { ...cluster, bills: keptBills };
        }).filter(c => c.bills.length > 0);

        return { finalClusters: updatedClusters, extremeOutliers: outliers };
    }, [clusters, billPositions]);

    // Draw axes for each subcategory
    const axes = subcategoryNames.map((subcat, i) => {
        const n = subcategoryNames.length;
        const angle = (2 * Math.PI * i) / n - Math.PI / 2;
        const endX = center + radius * Math.cos(angle);
        const endY = center + radius * Math.sin(angle);
        const labelX = center + (radius + 30) * Math.cos(angle);
        const labelY = center + (radius + 30) * Math.sin(angle);

        return (
            <g key={subcat}>
                <line
                    x1={center}
                    y1={center}
                    x2={endX}
                    y2={endY}
                    stroke="#e2e8f0"
                    strokeWidth={1}
                />
                <text
                    x={labelX}
                    y={labelY}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="text-xs fill-gray-600"
                    style={{ fontSize: '10px' }}
                >
                    {subcat.length > 20 ? subcat.slice(0, 20) + '...' : subcat}
                </text>
            </g>
        );
    });

    // Draw concentric circles
    const circles = [0.25, 0.5, 0.75, 1].map(r => (
        <circle
            key={r}
            cx={center}
            cy={center}
            r={radius * r}
            fill="none"
            stroke="#e2e8f0"
            strokeWidth={1}
            strokeDasharray={r === 1 ? "0" : "4,4"}
        />
    ));

    // Color palette for clusters
    const clusterColors = [
        'rgba(239, 68, 68, 0.7)',   // red
        'rgba(249, 115, 22, 0.7)',  // orange
        'rgba(234, 179, 8, 0.7)',   // yellow
        'rgba(34, 197, 94, 0.7)',   // green
        'rgba(6, 182, 212, 0.7)',   // cyan
        'rgba(59, 130, 246, 0.7)', // blue
        'rgba(139, 92, 246, 0.7)', // purple
        'rgba(236, 72, 153, 0.7)', // pink
    ];

    return (
        <div className="relative">
            {/* Toggle button */}
            <div className="flex justify-center mb-4">
                <button
                    onClick={() => setShowClusters(!showClusters)}
                    className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition"
                >
                    {showClusters ? 'Show Individual Bills' : 'Show Clusters'}
                </button>
            </div>

            <svg width={size} height={size} className="mx-auto">
                {/* Background circles */}
                {circles}

                {/* Axes */}
                {axes}

                {showClusters && finalClusters.length > 0 ? (
                    <>
                        {/* Cluster bubbles */}
                        {finalClusters.map((cluster, i) => {
                            const minRadius = 15;
                            const maxRadius = 50;
                            const maxBills = Math.max(...finalClusters.map(c => c.bills.length), 1);
                            const bubbleRadius = minRadius + (cluster.bills.length / maxBills) * (maxRadius - minRadius);
                            const isSelected = hoveredCluster === i;
                            const isDimmed = hoveredCluster !== null && hoveredCluster !== i;

                            return (
                                <g
                                    key={i}
                                    onClick={() => setHoveredCluster(hoveredCluster === i ? null : i)}
                                    style={{
                                        opacity: isDimmed ? 0.3 : 1,
                                        transition: 'opacity 0.2s ease'
                                    }}
                                >
                                    <circle
                                        cx={cluster.x}
                                        cy={cluster.y}
                                        r={bubbleRadius}
                                        fill={clusterColors[i % clusterColors.length]}
                                        stroke={isSelected ? '#1e40af' : clusterColors[i % clusterColors.length].replace('0.7', '1')}
                                        strokeWidth={isSelected ? 3 : 2}
                                        className="cursor-pointer transition-all"
                                    >
                                        <title>{`Cluster ${i + 1}: ${cluster.bills.length} bills - Click to view`}</title>
                                    </circle>
                                    <text
                                        x={cluster.x}
                                        y={cluster.y}
                                        textAnchor="middle"
                                        dominantBaseline="middle"
                                        fill="white"
                                        fontWeight="bold"
                                        fontSize="12"
                                    >
                                        {cluster.bills.length}
                                    </text>
                                </g>
                            );
                        })}
                        {/* Extreme outliers as individual dots */}
                        {extremeOutliers.map((pos, i) => (
                            <circle
                                key={`outlier-${i}`}
                                cx={pos.x}
                                cy={pos.y}
                                r={5}
                                fill="rgba(107, 114, 128, 0.7)"
                                stroke="rgba(107, 114, 128, 1)"
                                strokeWidth={1}
                                className="cursor-pointer hover:fill-gray-500"
                            >
                                <title>{pos.bill.legislation_number} (outlier)</title>
                            </circle>
                        ))}
                    </>
                ) : (
                    /* Individual bill dots */
                    billPositions.map((pos, i) => (
                        <circle
                            key={i}
                            cx={pos.x}
                            cy={pos.y}
                            r={4}
                            fill="rgba(59, 130, 246, 0.6)"
                            stroke="rgba(59, 130, 246, 1)"
                            strokeWidth={1}
                            className="cursor-pointer hover:fill-blue-500"
                        >
                            <title>{pos.bill.legislation_number}</title>
                        </circle>
                    ))
                )}

                {/* Center dot */}
                <circle cx={center} cy={center} r={3} fill="#94a3b8" />
            </svg>
            <div className="text-center text-sm text-gray-500 mt-2">
                {showClusters
                    ? `${clusters.length} clusters from ${bills.length} bills`
                    : `${bills.length} bills plotted`
                }
            </div>

            {/* Side panel for hovered cluster bills */}
            {showClusters && hoveredCluster !== null && finalClusters[hoveredCluster] && (
                <div
                    className="absolute top-0 right-0 w-72 max-h-96 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden"
                    style={{
                        transform: 'translateX(100%)',
                        animation: 'slideIn 0.2s ease forwards'
                    }}
                >
                    <style>{`
                        @keyframes slideIn {
                            from { transform: translateX(100%); opacity: 0; }
                            to { transform: translateX(0); opacity: 1; }
                        }
                    `}</style>
                    <div className="bg-gray-50 px-4 py-3 border-b">
                        <h3 className="font-semibold text-gray-700">
                            Cluster {hoveredCluster + 1}
                        </h3>
                        <p className="text-sm text-gray-500">
                            {finalClusters[hoveredCluster].bills.length} bills
                        </p>
                    </div>
                    <div className="overflow-y-auto max-h-72 p-2">
                        {finalClusters[hoveredCluster].bills.map((bill, i) => (
                            <a
                                key={i}
                                href={bill.url || '#'}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                onClick={(e) => !bill.url && e.preventDefault()}
                            >
                                <div className="font-medium truncate">
                                    {bill.title || bill.legislation_number}
                                </div>
                                <div className="text-xs text-gray-400">
                                    {bill.legislation_number}
                                </div>
                            </a>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

// Types for our data
interface Subcategory {
    subcategory: string;
    bill_type: string;  // This is the parent category
    embedding: number[];
}

interface Bill {
    legislation_number: string;
    category: string;
    embedding: number[];
    title: string;
    url: string;
}

interface BillWithScores {
    legislation_number: string;
    category: string;
    title: string;
    url: string;
    subcategoryScores: Record<string, number>;  // subcategory name -> similarity score (0-1)
}

// Cosine similarity between two vectors
function cosineSimilarity(vec1: number[], vec2: number[]): number {
    if (vec1.length !== vec2.length) return 0;

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < vec1.length; i++) {
        dotProduct += vec1[i] * vec2[i];
        norm1 += vec1[i] * vec1[i];
        norm2 += vec2[i] * vec2[i];
    }

    const magnitude = Math.sqrt(norm1) * Math.sqrt(norm2);
    if (magnitude === 0) return 0;

    const similarity = dotProduct / magnitude;
    // Normalize from [-1, 1] to [0, 1]
    return (similarity + 1) / 2;
}

export default function GraphClient() {
    const [bills, setBills] = useState<BillWithScores[]>([]);
    const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

    useEffect(() => {
        async function fetchData() {
            try {
                setLoading(true);

                // Fetch subcategories with embeddings
                const { data: subcatData, error: subcatError } = await supabase
                    .from('categories_embeddings')
                    .select('subcategory, bill_type, embedding');

                if (subcatError) throw subcatError;

                // Fetch bills with embeddings (increase limit from default 1000)
                const { data: billsData, error: billsError } = await supabase
                    .from('house_bills')
                    .select('legislation_number, category, embedding, title, url')
                    .limit(10000);

                if (billsError) throw billsError;

                const subcats = subcatData as Subcategory[];
                const rawBills = billsData as Bill[];

                console.log('Fetched subcategories:', subcats.length, subcats.slice(0, 2));
                //console.log('Subcategory bill_types:', [...new Set(subcats.map(s => s.bill_type))]);
                console.log('Fetched bills:', rawBills.length, rawBills.slice(0, 2));
                //console.log('Bill categories:', [...new Set(rawBills.map(b => b.category))]);

                // Debug: Check embedding format
                if (subcats.length > 0) {
                    const sampleSubcat = subcats[0];
                    console.log('Sample subcategory embedding:', {
                        type: typeof sampleSubcat.embedding,
                        isArray: Array.isArray(sampleSubcat.embedding),
                        length: sampleSubcat.embedding?.length,
                        sample: sampleSubcat.embedding?.slice(0, 5)
                    });
                }
                if (rawBills.length > 0) {
                    const sampleBill = rawBills[0];
                    console.log('Sample bill embedding:', {
                        type: typeof sampleBill.embedding,
                        isArray: Array.isArray(sampleBill.embedding),
                        length: sampleBill.embedding?.length,
                        sample: sampleBill.embedding?.slice(0, 5)
                    });
                }


                setSubcategories(subcats);

                // Get unique bill_types from subcategories (these are the 8 main categories)
                const mainCategories = Array.from(new Set(subcats.map(s => s.bill_type)));
                console.log('Main categories found:', mainCategories);

                // Helper to parse embedding (stored as JSON string in Supabase)
                const parseEmbedding = (embedding: string | number[]): number[] => {
                    if (Array.isArray(embedding)) return embedding;
                    if (typeof embedding === 'string') {
                        try {
                            return JSON.parse(embedding);
                        } catch {
                            console.error('Failed to parse embedding:', embedding.slice(0, 50));
                            return [];
                        }
                    }
                    return [];
                };

                // Parse subcategory embeddings once
                const parsedSubcats = subcats.map(s => ({
                    ...s,
                    embedding: parseEmbedding(s.embedding)
                }));

                // Calculate similarity scores for each bill against subcategories in its category
                const billsWithScores: BillWithScores[] = rawBills
                    .filter(bill => bill.category) // Only process bills with categories
                    .map((bill) => {
                        const scores: Record<string, number> = {};
                        const billEmbedding = parseEmbedding(bill.embedding);

                        // Only calculate scores for subcategories in the bill's category
                        const relevantSubcats = parsedSubcats.filter(s => s.bill_type === bill.category);

                        for (const subcat of relevantSubcats) {
                            scores[subcat.subcategory] = cosineSimilarity(billEmbedding, subcat.embedding);
                        }

                        return {
                            legislation_number: bill.legislation_number,
                            category: bill.category,
                            title: bill.title || bill.legislation_number,
                            url: bill.url || '',
                            subcategoryScores: scores
                        };
                    });

                setBills(billsWithScores);

                // Set initial selected category
                const categories = Array.from(new Set(rawBills.map(b => b.category)));
                if (categories.length > 0) {
                    setSelectedCategory(categories[0]);
                }

            } catch (err) {
                console.error('Fetch error:', err);
                setError(err instanceof Error ? err.message : 'Failed to fetch data');
            } finally {
                setLoading(false);
            }
        }

        fetchData();
    }, []);

    // Get unique categories for the dropdown
    const categories = Array.from(new Set(bills.map(b => b.category)));

    // Filter bills by selected category
    const filteredBills = selectedCategory
        ? bills.filter(b => b.category === selectedCategory)
        : bills;

    // Get subcategories for selected category
    const categorySubcats = selectedCategory
        ? subcategories.filter(s => s.bill_type === selectedCategory)
        : [];

    if (loading) {
        return <div className="p-4">Loading bills and subcategories...</div>;
    }

    if (error) {
        return <div className="p-4 text-red-500">Error: {error}</div>;
    }

    return (
        <div className="p-4">
            <h1 className="text-2xl font-bold mb-4">Environmental Bills Radar</h1>

            {/* Category selector */}
            <div className="mb-4">
                <label className="mr-2 font-medium">Select Category:</label>
                <select
                    value={selectedCategory || ''}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="border rounded px-3 py-2"
                >
                    {categories.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                    ))}
                </select>
            </div>

            {/* Stats */}
            <div className="mb-4 text-gray-600">
                <p>Total bills in category: {filteredBills.length}</p>
                <p>Subcategories: {categorySubcats.map(s => s.subcategory).join(', ')}</p>
            </div>

            {/* Polar Scatter Chart */}
            <div className="mb-8">
                <h2 className="text-xl font-semibold mb-4">Bills Distribution</h2>
                <PolarScatterChart
                    bills={filteredBills}
                    subcategoryNames={categorySubcats.map(s => s.subcategory)}
                />
            </div>

            {/* Sample of bills with scores */}
            <div className="mt-4">
                <h2 className="text-xl font-semibold mb-2">Sample Bills with Subcategory Scores</h2>
                <div className="space-y-4">
                    {filteredBills.slice(0, 5).map(bill => (
                        <div key={bill.legislation_number} className="border rounded p-4">
                            <h3 className="font-medium">{bill.legislation_number}</h3>
                            <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                                {Object.entries(bill.subcategoryScores).map(([subcat, score]) => (
                                    <div key={subcat} className="flex justify-between">
                                        <span>{subcat}:</span>
                                        <span className="font-mono">{score.toFixed(3)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
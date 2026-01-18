"use client"
import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/lib/supabase";
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
    minYear: number;
    maxYear: number;
    selectedYearRange: [number, number];
    onYearRangeChange: (range: [number, number]) => void;
}

function PolarScatterChart({ bills, subcategoryNames, minYear, maxYear, selectedYearRange, onYearRangeChange }: PolarScatterChartProps) {
    const [showClusters, setShowClusters] = useState(true);
    const [hoveredCluster, setHoveredCluster] = useState<number | null>(null);
    const [selectedBill, setSelectedBill] = useState<BillWithScores | null>(null);
    const [panelHeight, setPanelHeight] = useState(300);

    // Playback state: 'playing' | 'paused' | 'reverse'
    const [playbackState, setPlaybackState] = useState<'paused' | 'playing' | 'reverse'>('paused');

    // Animation effect - moves range 1 year per second
    useEffect(() => {
        if (playbackState === 'paused') return;

        const interval = setInterval(() => {
            const rangeWidth = selectedYearRange[1] - selectedYearRange[0];
            const direction = playbackState === 'playing' ? 1 : -1;

            let newMin = selectedYearRange[0] + direction;
            let newMax = selectedYearRange[1] + direction;

            // Stop at boundaries
            if (newMin < minYear || newMax > maxYear) {
                setPlaybackState('paused');
                return;
            }

            onYearRangeChange([newMin, newMax]);
        }, 500);

        return () => clearInterval(interval);
    }, [playbackState, selectedYearRange, minYear, maxYear, onYearRangeChange]);

    // Dual slider state for min thumb and max thumb
    const [isDraggingMin, setIsDraggingMin] = useState(false);
    const [isDraggingMax, setIsDraggingMax] = useState(false);

    // Playback state: 'playing' | 'paused' | 'reverse'

    // Animation effect - moves range 1 year per second
    useEffect(() => {
        if (playbackState === 'paused') return;

        const interval = setInterval(() => {
            const rangeWidth = selectedYearRange[1] - selectedYearRange[0];
            const direction = playbackState === 'playing' ? 1 : -1;

            let newMin = selectedYearRange[0] + direction;
            let newMax = selectedYearRange[1] + direction;

            // Stop at boundaries
            if (newMin < minYear || newMax > maxYear) {
                setPlaybackState('paused');
                return;
            }

            onYearRangeChange([newMin, newMax]);
        }, 500);

        return () => clearInterval(interval);
    }, [playbackState, selectedYearRange, minYear, maxYear, onYearRangeChange]);

    // Constants must be defined before hooks that use them
    const size = 600;
    const center = size / 2;
    const radius = size * 0.40;

    // Convert bills to score vectors for clustering (memoized)
    const scoreVectors = useMemo(() =>
        bills.map(bill =>
            subcategoryNames.map(subcat => bill.subcategoryScores[subcat] || 0)
        ),
        [bills, subcategoryNames]
    );

    // Calculate position for a score vector (memoized callback)
    const getPosition = useCallback((scores: number[]) => {
        const n = subcategoryNames.length;
        if (n === 0) return { x: center, y: center };

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
    }, [subcategoryNames.length, radius, center]);

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
        const dynamicClusters = Math.max(2, Math.min(12, Math.round(2 + spreadRatio * 20)));

        console.log(`Spread ratio: ${spreadRatio.toFixed(3)}, Clusters: ${dynamicClusters}`);

        try {
            const result = kmeans(scoreVectors, dynamicClusters, {
                initialization: 'kmeans++',
                maxIterations: 100,
                seed: 42  // Fixed seed for deterministic results
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

            // Iteratively merge overlapping clusters until no overlaps remain
            const overlapThreshold = 0.05; // Merge if practically ANY overlap (>5%)
            let currentClusters = [...finalClusters];
            let changed = true;

            while (changed && currentClusters.length > 1) {
                changed = false;

                // Recalculate max bills for radius scaling based on CURRENT state
                const currMaxBills = Math.max(...currentClusters.map(c => c.bills.length), 1);

                for (let i = 0; i < currentClusters.length; i++) {
                    for (let j = i + 1; j < currentClusters.length; j++) {
                        const c1 = currentClusters[i];
                        const c2 = currentClusters[j];

                        // Calculate radii based on current max
                        const r1 = getClusterRadius(c1.bills.length, currMaxBills);
                        const r2 = getClusterRadius(c2.bills.length, currMaxBills);

                        const dx = c1.x - c2.x;
                        const dy = c1.y - c2.y;
                        const dist = Math.sqrt(dx * dx + dy * dy);

                        // Check actual distance vs sum of radii (visual overlap)
                        // If dist < r1 + r2, they touch/overlap
                        const isOverlapping = dist < (r1 + r2) * (1 - overlapThreshold);

                        if (isOverlapping) {
                            // Merge j into i
                            const totalBills = c1.bills.length + c2.bills.length;

                            // Weighted centroid
                            const newX = (c1.x * c1.bills.length + c2.x * c2.bills.length) / totalBills;
                            const newY = (c1.y * c1.bills.length + c2.y * c2.bills.length) / totalBills;

                            const mergedCluster: Cluster = {
                                ...c1,
                                bills: [...c1.bills, ...c2.bills],
                                x: newX,
                                y: newY,
                                centroid: c1.centroid // Approximate (not heavily used after this)
                            };

                            // Replace i with merged, remove j
                            currentClusters[i] = mergedCluster;
                            currentClusters.splice(j, 1);

                            changed = true;
                            break; // Restart inner loop since indices changed
                        }
                    }
                    if (changed) break; // Restart outer loop
                }
            }

            return currentClusters;


        } catch (e) {
            console.error('Clustering failed:', e);
            return [];
        }
    }, [bills, subcategoryNames, scoreVectors, getPosition, size]);

    // Individual bill positions (memoized)
    const billPositions = useMemo(() =>
        bills.map(bill => {
            const scores = subcategoryNames.map(subcat => bill.subcategoryScores[subcat] || 0);
            const pos = getPosition(scores);
            return { ...pos, bill };
        }),
        [bills, subcategoryNames, getPosition]
    );

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

    // Early return for empty data (placed after all hooks)
    if (subcategoryNames.length === 0 || bills.length === 0) {
        return <div className="text-gray-500">No data to display</div>;
    }

    // Format subcategory name from snake_case to Title Case
    const formatSubcatName = (name: string): string => {
        return name
            .split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
    };

    // Draw axis lines (rendered under everything)
    const axisLines = subcategoryNames.map((subcat, i) => {
        const n = subcategoryNames.length;
        const angle = (2 * Math.PI * i) / n - Math.PI / 2;
        const endX = center + radius * Math.cos(angle);
        const endY = center + radius * Math.sin(angle);

        return (
            <line
                key={`line-${subcat}`}
                x1={center}
                y1={center}
                x2={endX}
                y2={endY}
                stroke="#e2e8f0"
                strokeWidth={1}
            />
        );
    });

    // Draw axis labels separately (rendered on top of everything else)
    const axisLabels = subcategoryNames.map((subcat, i) => {
        const n = subcategoryNames.length;
        const angle = (2 * Math.PI * i) / n - Math.PI / 2;

        // Position labels outside the chart
        const labelDistance = radius + 40;
        const labelX = center + labelDistance * Math.cos(angle);
        const labelY = center + labelDistance * Math.sin(angle);

        // Smart text anchoring based on position around the circle
        const normalizedAngle = ((angle + Math.PI / 2) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
        let textAnchor: 'start' | 'middle' | 'end' = 'middle';
        if (normalizedAngle > Math.PI * 0.15 && normalizedAngle < Math.PI * 0.85) {
            textAnchor = 'start';
        } else if (normalizedAngle > Math.PI * 1.15 && normalizedAngle < Math.PI * 1.85) {
            textAnchor = 'end';
        }

        const formattedName = formatSubcatName(subcat);

        return (
            <text
                key={`label-${subcat}`}
                x={labelX}
                y={labelY}
                textAnchor={textAnchor}
                dominantBaseline="middle"
                fill="white"
                style={{ fontSize: '14px' }}
            >
                {formattedName}
            </text>
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
        <div className="relative" style={{ overflow: 'visible', padding: '0 80px' }}>
            {/* Year Range Slider */}
            <div className="flex justify-center mb-3">
                <div className="flex items-center gap-3 bg-gray-50 px-4 py-2 rounded-lg">
                    <span className="text-sm font-medium text-gray-600 w-10">{selectedYearRange[0]}</span>
                    <div className="relative w-48 h-6">
                        {/* Track background */}
                        <div className="absolute top-1/2 -translate-y-1/2 w-full h-1.5 bg-gray-200 rounded-full" />
                        {/* Selected range highlight */}
                        <div
                            className="absolute top-1/2 -translate-y-1/2 h-1.5 bg-blue-500 rounded-full"
                            style={{
                                left: `${((selectedYearRange[0] - minYear) / (maxYear - minYear)) * 100}%`,
                                right: `${100 - ((selectedYearRange[1] - minYear) / (maxYear - minYear)) * 100}%`
                            }}
                        />
                        {/* Center drag handle - small dark bar to drag both thumbs together, positioned 5px above */}
                        <div
                            className="absolute cursor-grab active:cursor-grabbing hover:bg-gray-600 transition-colors"
                            style={{
                                left: `${((selectedYearRange[0] + selectedYearRange[1]) / 2 - minYear) / (maxYear - minYear) * 100}%`,
                                top: '-11px',
                                transform: 'translate(-50%, -100%)',
                                width: '20px',
                                height: '6px',
                                backgroundColor: '#6b7280',
                                borderRadius: '3px',
                                zIndex: 5
                            }}
                            onMouseDown={(e) => {
                                e.preventDefault();
                                const startX = e.clientX;
                                const startMin = selectedYearRange[0];
                                const startMax = selectedYearRange[1];
                                const rangeWidth = startMax - startMin;
                                const trackWidth = 192; // w-48 = 12rem = 192px
                                const yearsPerPixel = (maxYear - minYear) / trackWidth;

                                const onMouseMove = (moveEvent: MouseEvent) => {
                                    const deltaX = moveEvent.clientX - startX;
                                    const deltaYears = Math.round(deltaX * yearsPerPixel);

                                    let newMin = startMin + deltaYears;
                                    let newMax = startMax + deltaYears;

                                    // Clamp to boundaries
                                    if (newMin < minYear) {
                                        newMin = minYear;
                                        newMax = minYear + rangeWidth;
                                    }
                                    if (newMax > maxYear) {
                                        newMax = maxYear;
                                        newMin = maxYear - rangeWidth;
                                    }

                                    onYearRangeChange([newMin, newMax]);
                                };

                                const onMouseUp = () => {
                                    document.removeEventListener('mousemove', onMouseMove);
                                    document.removeEventListener('mouseup', onMouseUp);
                                };

                                document.addEventListener('mousemove', onMouseMove);
                                document.addEventListener('mouseup', onMouseUp);
                            }}
                        />
                        {/* Min thumb - positioned behind, pointer-events on */}
                        <input
                            type="range"
                            min={minYear}
                            max={maxYear}
                            value={selectedYearRange[0]}
                            onChange={(e) => {
                                const val = parseInt(e.target.value);
                                if (val < selectedYearRange[1]) {
                                    onYearRangeChange([val, selectedYearRange[1]]);
                                }
                            }}
                            className="absolute w-full h-6 bg-transparent cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-blue-600 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:shadow-md [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:bg-blue-600 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white"
                            style={{ zIndex: 3, appearance: 'none', WebkitAppearance: 'none', background: 'transparent' }}
                        />
                        {/* Max thumb - positioned on top but with pointer-events:none, thumb has pointer-events:auto */}
                        <input
                            type="range"
                            min={minYear}
                            max={maxYear}
                            value={selectedYearRange[1]}
                            onChange={(e) => {
                                const val = parseInt(e.target.value);
                                if (val > selectedYearRange[0]) {
                                    onYearRangeChange([selectedYearRange[0], val]);
                                }
                            }}
                            className="absolute w-full h-6 bg-transparent cursor-pointer pointer-events-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-blue-600 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:shadow-md [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:bg-blue-600 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white"
                            style={{ zIndex: 4, appearance: 'none', WebkitAppearance: 'none', background: 'transparent' }}
                        />
                    </div>
                    <span className="text-sm font-medium text-gray-600 w-10">{selectedYearRange[1]}</span>
                </div>
            </div>

            {/* Playback controls - static size */}
            <div className="flex justify-center mb-3 gap-2">
                <button
                    onClick={() => setPlaybackState(playbackState === 'reverse' ? 'paused' : 'reverse')}
                    className={`w-10 h-10 flex items-center justify-center rounded-full border-2 transition-colors ${playbackState === 'reverse'
                        ? 'bg-blue-500 border-blue-500 text-white'
                        : 'bg-white border-gray-300 text-gray-600 hover:border-gray-400'
                        }`}
                    title="Reverse"
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19 12L7 5v14l12-7z" transform="scale(-1,1) translate(-24,0)" />
                    </svg>
                </button>
                <button
                    onClick={() => setPlaybackState('paused')}
                    className={`w-10 h-10 flex items-center justify-center rounded-full border-2 transition-colors ${playbackState === 'paused'
                        ? 'bg-gray-500 border-gray-500 text-white'
                        : 'bg-white border-gray-300 text-gray-600 hover:border-gray-400'
                        }`}
                    title="Pause"
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <rect x="6" y="5" width="4" height="14" />
                        <rect x="14" y="5" width="4" height="14" />
                    </svg>
                </button>
                <button
                    onClick={() => setPlaybackState(playbackState === 'playing' ? 'paused' : 'playing')}
                    className={`w-10 h-10 flex items-center justify-center rounded-full border-2 transition-colors ${playbackState === 'playing'
                        ? 'bg-blue-500 border-blue-500 text-white'
                        : 'bg-white border-gray-300 text-gray-600 hover:border-gray-400'
                        }`}
                    title="Play"
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M8 5v14l11-7z" />
                    </svg>
                </button>
            </div>

            {/* Toggle button */}
            <div className="flex justify-center mb-4">
                <button
                    onClick={() => setShowClusters(!showClusters)}
                    className="px-4 py-2 bg-card text-main rounded-lg border border-border hover:bg-card-hover transition font-medium shadow-sm"
                >
                    {showClusters ? 'Show Individual Bills' : 'Show Clusters'}
                </button>
            </div>

            <svg width={size} height={size} className="mx-auto" style={{ overflow: 'visible' }}>
                {/* Background circles */}
                {circles}

                {/* Axis lines (underneath everything) */}
                {axisLines}

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
                            fill={selectedBill?.legislation_number === pos.bill.legislation_number ? 'rgba(37, 99, 235, 1)' : 'rgba(59, 130, 246, 0.6)'}
                            stroke={selectedBill?.legislation_number === pos.bill.legislation_number ? '#1e40af' : 'rgba(59, 130, 246, 1)'}
                            strokeWidth={selectedBill?.legislation_number === pos.bill.legislation_number ? 2 : 1}
                            className="cursor-pointer hover:fill-blue-500"
                            onClick={() => setSelectedBill(selectedBill?.legislation_number === pos.bill.legislation_number ? null : pos.bill)}
                        >
                            <title>{pos.bill.legislation_number}</title>
                        </circle>
                    ))
                )}

                {/* Center dot */}
                <circle cx={center} cy={center} r={3} fill="#94a3b8" />

                {/* Axis labels (rendered LAST so they appear on top) */}
                {axisLabels}
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
                    className="fixed top-20 right-0 w-80 bg-card border-l border-b border-border shadow-xl overflow-hidden z-50"
                    style={{ height: panelHeight, minHeight: 150, maxHeight: 600 }}
                >
                    <div
                        className="bg-card px-4 py-2.5 border-b border-border flex justify-between items-center"
                    >
                        <span className="text-sm text-main font-semibold">
                            Cluster Bills ({finalClusters[hoveredCluster].bills.length})
                        </span>
                        <button
                            onClick={() => setHoveredCluster(null)}
                            className="text-main/50 hover:text-main text-lg leading-none"
                        >
                            ×
                        </button>
                    </div>
                    <div
                        className="overflow-y-auto p-2"
                        style={{ height: panelHeight - 80 }}
                    >
                        {finalClusters[hoveredCluster].bills.map((bill, i) => (
                            <a
                                key={i}
                                href={bill.url || '#'}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block px-3 py-2 text-sm hover:bg-accent/20 rounded-lg transition-colors"
                                onClick={(e) => !bill.url && e.preventDefault()}
                            >
                                <div className="font-medium text-main truncate">
                                    {bill.title || bill.legislation_number}
                                </div>
                                <div className="text-xs text-main/60">
                                    {bill.legislation_number}
                                </div>
                            </a>
                        ))}
                    </div>
                    {/* Resize handle */}
                    <div
                        className="h-6 bg-card border-t border-border cursor-ns-resize flex items-center justify-center hover:bg-card-hover"
                        onMouseDown={(e) => {
                            e.preventDefault();
                            const startY = e.clientY;
                            const startHeight = panelHeight;
                            const onMouseMove = (moveEvent: MouseEvent) => {
                                const newHeight = startHeight + (moveEvent.clientY - startY);
                                setPanelHeight(Math.max(150, Math.min(600, newHeight)));
                            };
                            const onMouseUp = () => {
                                document.removeEventListener('mousemove', onMouseMove);
                                document.removeEventListener('mouseup', onMouseUp);
                            };
                            document.addEventListener('mousemove', onMouseMove);
                            document.addEventListener('mouseup', onMouseUp);
                        }}
                    >
                        <div className="w-10 h-1 bg-border rounded-full"></div>
                    </div>
                </div>
            )}

            {/* Side panel for selected individual bill */}
            {!showClusters && selectedBill && (
                <div
                    className="fixed top-0 right-0 w-80 bg-white border-l border-b border-gray-200 shadow-xl overflow-hidden z-50"
                >
                    <div
                        className="bg-gray-50 px-4 py-2.5 border-b flex justify-between items-center"
                    >
                        <span className="text-sm text-gray-700 font-semibold">Bill Details</span>
                        <button
                            onClick={() => setSelectedBill(null)}
                            className="text-gray-400 hover:text-gray-600 text-lg leading-none"
                        >
                            ×
                        </button>
                    </div>
                    <div className="p-4">
                        <div className="mb-3">
                            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Legislation Number</div>
                            <div className="font-semibold text-gray-900">{selectedBill.legislation_number}</div>
                        </div>
                        <div className="mb-4">
                            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Title</div>
                            <div className="text-sm text-gray-800">{selectedBill.title || 'No title available'}</div>
                        </div>
                        {selectedBill.url && (
                            <a
                                href={selectedBill.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center px-4 py-2 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 transition-colors"
                            >
                                View Full Bill →
                            </a>
                        )}
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
    subcategory_scores: Record<string, number> | null;
    title: string;
    url: string;
    date_of_introduction: string | null;  // ISO date string from Supabase
}

interface BillWithScores {
    legislation_number: string;
    category: string;
    title: string;
    url: string;
    subcategoryScores: Record<string, number>;  // subcategory name -> similarity score (0-1)
    introductionYear: number | null;  // Year the bill was introduced
}



// Format category name from snake_case to Title Case
// e.g., "disaster_and_emergency" -> "Disaster and Emergency"
function formatCategoryName(name: string): string {
    return name
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
}

export default function GraphClient() {
    const [bills, setBills] = useState<BillWithScores[]>([]);
    const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

    const [isBackgroundLoading, setIsBackgroundLoading] = useState(false);
    const [showInstructions, setShowInstructions] = useState(true);

    // Year range filter state
    const [yearRange, setYearRange] = useState<[number, number]>([1990, 2026]);
    const [selectedYearRange, setSelectedYearRange] = useState<[number, number]>([1990, 2026]);

    const dismissInstructions = () => {
        setShowInstructions(false);
    };

    useEffect(() => {
        async function fetchData() {
            try {
                setLoading(true);

                // 1. Fetch subcategories first
                const { data: subcatData, error: subcatError } = await supabase
                    .from('categories_embeddings')
                    .select('subcategory, bill_type, embedding');

                if (subcatError) throw subcatError;

                const subcats = subcatData as Subcategory[];

                // Helper to parse embedding
                const parseEmbedding = (embedding: string | number[]): number[] => {
                    if (Array.isArray(embedding)) return embedding;
                    if (typeof embedding === 'string') {
                        try {
                            return JSON.parse(embedding);
                        } catch {
                            return [];
                        }
                    }
                    return [];
                };

                // Parse subcategory embeddings
                const parsedSubcats = subcats.map(s => ({
                    ...s,
                    embedding: parseEmbedding(s.embedding)
                }));

                setSubcategories(parsedSubcats);

                // 2. Identify first category
                const uniqueCategories = Array.from(new Set(subcats.map(s => s.bill_type))).sort();
                const firstCategory = uniqueCategories.length > 0 ? uniqueCategories[0] : null;

                if (!firstCategory) {
                    setLoading(false);
                    return;
                }

                // Set initial selection to first category
                setSelectedCategory(firstCategory);

                console.log(`Initial load: Fetching bills for category '${firstCategory}'...`);

                // 3. Fetch ONLY first category bills immediately
                const { data: initialBillsData, error: initialError } = await supabase
                    .from('house_bills')
                    .select('legislation_number, category, subcategory_scores, title, url, date_of_introduction')
                    .eq('category', firstCategory)
                    .not('subcategory_scores', 'is', null)
                    .limit(2000); // Generous limit for single category

                if (initialError) throw initialError;

                const initialBills = initialBillsData as Bill[];

                // Process bills - now just use pre-computed scores
                const processBills = (rawBills: Bill[]) => {
                    return rawBills
                        .filter(bill => bill.category && bill.subcategory_scores)
                        .map((bill) => {
                            // Extract year from date_of_introduction
                            let introYear: number | null = null;
                            if (bill.date_of_introduction) {
                                const year = new Date(bill.date_of_introduction).getFullYear();
                                if (!isNaN(year)) introYear = year;
                            }
                            return {
                                legislation_number: bill.legislation_number,
                                category: bill.category,
                                title: bill.title || bill.legislation_number,
                                url: bill.url || '',
                                subcategoryScores: bill.subcategory_scores as Record<string, number>,
                                introductionYear: introYear
                            };
                        });
                };

                const initialProcessed = processBills(initialBills);
                setBills(initialProcessed);
                setLoading(false); // Enable interaction immediately

                // 4. Background fetch for the rest (everything NOT in first category)
                setIsBackgroundLoading(true);

                const fetchChunk = async (from: number, to: number) => {
                    console.log(`Background fetch: rows ${from}-${to} (excluding ${firstCategory})`);

                    const { data: chunkData, error: chunkError } = await supabase
                        .from('house_bills')
                        .select('legislation_number, category, subcategory_scores, title, url, date_of_introduction')
                        .neq('category', firstCategory) // Exclude what we already have
                        .not('subcategory_scores', 'is', null)
                        .range(from, to);

                    if (chunkError) {
                        console.error('Background fetch error:', chunkError);
                        return false;
                    }

                    if (!chunkData || chunkData.length === 0) return false;

                    const chunkBills = chunkData as Bill[];
                    const processedChunk = processBills(chunkBills);

                    setBills(prev => [...prev, ...processedChunk]);
                    return true;
                };

                // Fetch in chunks of 1000
                const CHUNK_SIZE = 1000;
                let offset = 0;
                let hasMore = true;

                while (hasMore) {
                    // Small delay to prevent UI freezing
                    await new Promise(resolve => setTimeout(resolve, 100));
                    hasMore = await fetchChunk(offset, offset + CHUNK_SIZE - 1);
                    offset += CHUNK_SIZE;

                    // Safety break
                    if (offset > 50000) break;
                }

                setIsBackgroundLoading(false);
                console.log('All data loaded!');

            } catch (err: any) {
                console.error('Fetch error:', err);
                console.error('Error details:', JSON.stringify(err, null, 2));
                setError(err.message || JSON.stringify(err) || 'Failed to fetch data');
                setLoading(false);
            }
        }

        fetchData();
    }, []);

    // Get unique categories for the dropdown
    // Get unique categories for the dropdown (combine from loaded bills and known subcategories to ensure complete list)
    const categories = Array.from(new Set(subcategories.map(s => s.bill_type))).sort();

    // Filter bills by selected category
    const categoryFilteredBills = selectedCategory
        ? bills.filter(b => b.category === selectedCategory)
        : bills;

    // Calculate min/max years from all loaded bills (only once when bills change)
    const yearBounds = useMemo(() => {
        const years = bills
            .map(b => b.introductionYear)
            .filter((y): y is number => y !== null);
        if (years.length === 0) return { min: 2000, max: 2026 };
        return { min: Math.min(...years), max: Math.max(...years) };
    }, [bills]);

    // Update yearRange when bounds change
    useEffect(() => {
        setYearRange([yearBounds.min, yearBounds.max]);
        setSelectedYearRange([yearBounds.min, yearBounds.max]);
    }, [yearBounds]);

    // Filter bills by selected year range
    const filteredBills = categoryFilteredBills.filter(b => {
        if (b.introductionYear === null) return true; // Include bills without date
        return b.introductionYear >= selectedYearRange[0] && b.introductionYear <= selectedYearRange[1];
    });

    // Get subcategories for selected category
    // Get subcategories for selected category OR all subcategories if All is selected
    const categorySubcats = selectedCategory
        ? subcategories.filter(s => s.bill_type === selectedCategory)
        : subcategories; // Use ALL subcategories when showing all bills

    if (loading) {
        return <div className="p-4">Loading bills and subcategories...</div>;
    }

    if (error) {
        return <div className="p-4 text-red-500">Error: {error}</div>;
    }

    return (
        <div className="p-6 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-3xl font-bold text-white">Policy Radar</h1>
                    <p className="text-gray-500 mt-1">Visualize environmental legislation by policy area</p>
                </div>
                {isBackgroundLoading && (
                    <div className="text-sm text-blue-600 animate-pulse bg-blue-50 px-3 py-1.5 rounded-full">
                        Loading more bills... ({bills.length} loaded)
                    </div>
                )}
            </div>

            <div className="flex gap-6">
                {/* Left Sidebar - Single Panel */}
                <div className="w-72 flex-shrink-0">
                    <div className="bg-card rounded-xl border border-border p-4 space-y-5">
                        {/* Category Selector */}
                        <div>
                            <label className="block text-sm font-semibold text-white mb-2">Category</label>
                            <select
                                value={selectedCategory || ''}
                                onChange={(e) => setSelectedCategory(e.target.value)}
                                className="w-full border bg-gray-300 border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            >
                                {categories.map(cat => (
                                    <option key={cat} value={cat}>{formatCategoryName(cat)}</option>
                                ))}
                            </select>
                        </div>

                        <hr className="border-gray-100" />

                        {/* Statistics */}
                        <div>
                            <h3 className="text-sm font-semibold text-white mb-3">Statistics</h3>
                            <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-gray-400">Bills in Category</span>
                                    <span className="text-lg font-bold text-gray-400">{filteredBills.length}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-gray-400">Subcategories</span>
                                    <span className="text-lg font-bold text-gray-400">{categorySubcats.length}</span>
                                </div>
                            </div>
                        </div>

                        <hr className="border-gray-100" />

                        {/* Policy Areas */}
                        <div>
                            <h3 className="text-sm font-semibold text-white mb-3">Policy Areas</h3>
                            <div className="flex flex-wrap gap-1.5">
                                {categorySubcats.map(s => (
                                    <span
                                        key={s.subcategory}
                                        className="px-2 py-1 text-gray-400 text-xs rounded-md font-medium"
                                    >
                                        {formatCategoryName(s.subcategory)}
                                    </span>
                                ))}
                            </div>
                        </div>

                        <hr className="border-gray-100" />

                        {/* How It Works */}
                        <div>
                            <h3 className="text-sm font-semibold text-white mb-3">How It Works</h3>
                            <div className="space-y-3 text-xs text-gray-400">
                                <div>
                                    <h4 className="font-semibold text-gray-400 mb-0.5">Policy Areas (Axes)</h4>
                                    <p>Each axis represents a subcategory. Bills are positioned based on their relevance to each policy area.</p>
                                </div>
                                <div>
                                    <h4 className="font-semibold text-gray-400 mb-0.5">Similarity Scores</h4>
                                    <p>Bills are compared using <strong>cosine similarity</strong> between text embeddings. Higher scores mean stronger relevance.</p>
                                </div>
                                <div>
                                    <h4 className="font-semibold text-gray-400 mb-0.5">Clustering</h4>
                                    <p>Similar bills are grouped using <strong>K-means clustering</strong>, analyzing similarity patterns to create related groups.</p>
                                </div>
                                <div>
                                    <h4 className="font-semibold text-gray-400 mb-0.5">Position</h4>
                                    <p>Bills closer to an axis have higher relevance to that topic. Bills near the center have balanced scores across areas.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Main Chart Area */}
                <div className="flex-1 relative">
                    {showInstructions && (
                        <div className="absolute top-0 left-0 z-20 w-64 bg-card backdrop-blur-sm p-4 rounded-lg shadow-xl border border-border">
                            <div className="flex justify-between items-start mb-2">
                                <h3 className="font-semibold text-white">Quick Tips</h3>
                                <button
                                    onClick={dismissInstructions}
                                    className="text-gray-800 hover:text-gray-600"
                                >
                                    ✕
                                </button>
                            </div>
                            <ul className="text-sm text-gray-600 space-y-2">
                                <li className="flex items-start">
                                    <span className="mr-2 text-white">•</span>
                                    <span className="text-gray-400">Click clusters to view grouped bills</span>
                                </li>
                                <li className="flex items-start">
                                    <span className="mr-2 text-white">•</span>
                                    <span className="text-gray-400">Toggle to see individual bill distribution</span>
                                </li>
                                <li className="flex items-start">
                                    <span className="mr-2 text-white">•</span>
                                    <span className="text-gray-400">Click bills in the side panel to view details</span>
                                </li>
                            </ul>
                        </div>
                    )}
                    <PolarScatterChart
                        bills={filteredBills}
                        subcategoryNames={categorySubcats.map(s => s.subcategory)}
                        minYear={yearRange[0]}
                        maxYear={yearRange[1]}
                        selectedYearRange={selectedYearRange}
                        onYearRangeChange={setSelectedYearRange}
                    />
                </div>
            </div>
        </div>
    );
}
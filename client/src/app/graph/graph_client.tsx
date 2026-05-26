"use client"
import { useEffect, useState, useMemo, useCallback } from "react";
import { kmeans } from 'ml-kmeans';
import { BillWithScores, Subcategory, Cluster } from '@/lib/types';
import { Card } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"

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

    // Constants must be defined before hooks that use them
    // Responsive chart size - fit within container on mobile
    const getChartSize = () => {
        if (typeof window !== 'undefined') {
            const vw = window.innerWidth
            if (vw < 400) return Math.min(260, vw - 32) // Very small phones
            if (vw < 640) return Math.min(300, vw - 32) // Mobile
            if (vw < 768) return 380 // Small tablet
        }
        return 600 // Desktop
    }
    const [dynamicSize, setDynamicSize] = useState(600)

    useEffect(() => {
        const handleResize = () => setDynamicSize(getChartSize())
        handleResize()
        window.addEventListener('resize', handleResize)
        return () => window.removeEventListener('resize', handleResize)
    }, [])

    const size = dynamicSize
    const center = size / 2
    const radius = size * 0.38

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
        return <div className="text-light">No data to display</div>;
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
                stroke="var(--color-border)"
                strokeWidth={1}
            />
        );
    });

    // Draw axis labels separately (rendered on top of everything else)
    const axisLabels = subcategoryNames.map((subcat, i) => {
        const n = subcategoryNames.length;
        const angle = (2 * Math.PI * i) / n - Math.PI / 2;

        // Position labels outside the chart - closer on mobile
        const labelDistance = size < 350 ? radius + 20 : radius + 40;
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
        // Smaller font on mobile
        const fontSize = size < 350 ? '9px' : size < 500 ? '11px' : '14px';

        return (
            <text
                key={`label-${subcat}`}
                x={labelX}
                y={labelY}
                textAnchor={textAnchor}
                dominantBaseline="middle"
                fill="var(--color-text)"
                style={{ fontSize }}
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
            stroke="var(--color-border)"
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
        <div className="relative" style={{ overflow: 'visible' }}>
            <div className="px-2 md:px-20">
                {/* Year Range Slider */}
                <div className="flex justify-center mb-3 px-2">
                    <Card className="flex flex-col sm:flex-row items-center gap-2 sm:gap-3 w-full sm:w-auto">
                        <span className="text-sm font-medium text-main w-10">{selectedYearRange[0]}</span>
                        <div className="relative w-48 h-6">
                            {/* Track background */}
                            <div className="absolute top-1/2 -translate-y-1/2 w-full h-1.5 bg-track" />
                            {/* Selected range highlight */}
                            <div
                                className="absolute top-1/2 -translate-y-1/2 h-1.5 bg-accent"
                                style={{
                                    left: `${((selectedYearRange[0] - minYear) / (maxYear - minYear)) * 100}%`,
                                    right: `${100 - ((selectedYearRange[1] - minYear) / (maxYear - minYear)) * 100}%`
                                }}
                            />
                            {/* Center drag handle - small dark bar to drag both thumbs together, positioned 5px above */}
                            <div
                                className="absolute cursor-grab active:cursor-grabbing bg-handle hover:bg-handle-strong transition-colors"
                                style={{
                                    left: `${((selectedYearRange[0] + selectedYearRange[1]) / 2 - minYear) / (maxYear - minYear) * 100}%`,
                                    top: '-11px',
                                    transform: 'translate(-50%, -100%)',
                                    width: '20px',
                                    height: '6px',
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
                                className="absolute w-full h-6 bg-transparent cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:bg-accent [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white"
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
                                className="absolute w-full h-6 bg-transparent cursor-pointer pointer-events-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:bg-accent [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white"
                                style={{ zIndex: 4, appearance: 'none', WebkitAppearance: 'none', background: 'transparent' }}
                            />
                        </div>
                        <span className="text-sm font-medium text-main w-10">{selectedYearRange[1]}</span>
                    </Card>
                </div>

                {/* Playback controls - static size */}
                <div className="flex justify-center mb-3 gap-2 flex-wrap">
                    <Button
                        onClick={() => setPlaybackState(playbackState === 'reverse' ? 'paused' : 'reverse')}
                        variant={playbackState === 'reverse' ? 'active' : 'default'}
                        className="w-10 h-10 flex items-center justify-center border transition-colors"
                        title="Reverse"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M19 12L7 5v14l12-7z" transform="scale(-1,1) translate(-24,0)" />
                        </svg>
                    </Button>
                    <Button
                        onClick={() => setPlaybackState('paused')}
                        variant={playbackState === 'paused' ? 'active' : 'default'}
                        className="w-10 h-10 flex items-center justify-center border transition-colors"
                        title="Pause"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <rect x="6" y="5" width="4" height="14" />
                            <rect x="14" y="5" width="4" height="14" />
                        </svg>
                    </Button>
                    <Button
                        onClick={() => setPlaybackState(playbackState === 'playing' ? 'paused' : 'playing')}
                        variant={playbackState === 'playing' ? 'active' : 'default'}
                        className="w-10 h-10 flex items-center justify-center border transition-colors"
                        title="Play"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M8 5v14l11-7z" />
                        </svg>
                    </Button>
                </div>

                {/* Toggle button */}
                <div className="flex justify-center mb-4">
                    <Button
                        onClick={() => setShowClusters(!showClusters)}
                    >
                        {showClusters ? 'Show Individual Bills' : 'Show Clusters'}
                    </Button>
                </div>

                <svg width={size} height={size} className="mx-auto" style={{ overflow: 'visible', marginTop: '45px' }}>
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
                                            transition: 'opacity 0.2s ease, transform 0.2s ease',
                                            transform: `translate(${cluster.x}px, ${cluster.y}px)`
                                        }}
                                    >
                                        <circle
                                            cx={0}
                                            cy={0}
                                            r={bubbleRadius}
                                            fill={clusterColors[i % clusterColors.length]}
                                            stroke={isSelected ? '#1e40af' : clusterColors[i % clusterColors.length].replace('0.7', '1')}
                                            strokeWidth={isSelected ? 3 : 2}
                                            className="cursor-pointer"
                                        >
                                            <title>{`Cluster ${i + 1}: ${cluster.bills.length} bills - Click to view`}</title>
                                        </circle>
                                        <text
                                            x={0}
                                            y={0}
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
                <div className="text-center text-sm text-light mt-2">
                    {showClusters
                        ? `${clusters.length} clusters from ${bills.length} bills`
                        : `${bills.length} bills plotted`
                    }
                </div>

                {/* Side panel for hovered cluster bills - becomes bottom sheet on mobile */}
                {showClusters && hoveredCluster !== null && finalClusters[hoveredCluster] && (
                    <div
                        className="fixed md:right-[10px] md:top-[84px] left-0 right-0 bottom-0 md:left-auto md:bottom-auto md:w-80 w-full bg-card border border-border overflow-hidden z-50 max-h-[50vh] md:max-h-[600px]"
                    >
                        <div
                            className="bg-nav px-4 py-2.5 flex justify-between items-center"
                        >
                            <span className="text-sm text-nav-text font-semibold">
                                Cluster Bills ({finalClusters[hoveredCluster].bills.length})
                            </span>
                            <button
                                onClick={() => setHoveredCluster(null)}
                                className="text-nav-text/70 hover:text-nav-text text-lg leading-none"
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
                                    className="block px-3 py-2 text-sm hover:bg-accent/20 transition-colors"
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
                            <div className="w-10 h-1 bg-border"></div>
                        </div>
                    </div>
                )}

                {/* Side panel for selected individual bill */}
                {!showClusters && selectedBill && (
                    <div
                        className="fixed w-80 bg-card border border-border overflow-hidden z-50"
                        style={{ top: '84px', right: '10px' }}
                    >
                        <div
                            className="bg-nav px-4 py-2.5 flex justify-between items-center"
                        >
                            <span className="text-sm text-nav-text font-semibold">Bill Details</span>
                            <button
                                onClick={() => setSelectedBill(null)}
                                className="text-nav-text/70 hover:text-nav-text text-lg leading-none"
                            >
                                ×
                            </button>
                        </div>
                        <div className="p-4">
                            <div className="mb-3">
                                <div className="text-xs text-light uppercase tracking-wide mb-1">Legislation Number</div>
                                <div className="font-semibold text-main">{selectedBill.legislation_number}</div>
                            </div>
                            <div className="mb-4">
                                <div className="text-xs text-light uppercase tracking-wide mb-1">Title</div>
                                <div className="text-sm text-main">{selectedBill.title || 'No title available'}</div>
                            </div>
                            {selectedBill.url && (
                                <Button
                                    as="a"
                                    href={selectedBill.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    variant="active"
                                    className="inline-flex items-center"
                                >
                                    View Full Bill →
                                </Button>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}


// Format category name from snake_case to Title Case
// e.g., "disaster_and_emergency" -> "Disaster and Emergency"
function formatCategoryName(name: string): string {
    return name
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
}

interface GraphClientProps {
    bills: BillWithScores[];
    subcategories: Subcategory[];
}

export default function GraphClient({ bills, subcategories }: GraphClientProps) {
    const [selectedCategory, setSelectedCategory] = useState<string | null>(
        () => Array.from(new Set(subcategories.map(s => s.bill_type))).sort()[0] ?? null
    );
    const [showInstructions, setShowInstructions] = useState(true);

    // Year range filter state
    const [yearRange, setYearRange] = useState<[number, number]>([1990, 2026]);
    const [selectedYearRange, setSelectedYearRange] = useState<[number, number]>([1990, 2026]);

    const dismissInstructions = () => {
        setShowInstructions(false);
    };

    const categories = Array.from(new Set(subcategories.map(s => s.bill_type))).sort();

    const categoryFilteredBills = selectedCategory
        ? bills.filter(b => b.category === selectedCategory)
        : bills;

    const yearBounds = useMemo(() => {
        const years = bills
            .map(b => b.introductionYear)
            .filter((y): y is number => y !== null);
        if (years.length === 0) return { min: 2000, max: 2026 };
        return { min: Math.min(...years), max: Math.max(...years) };
    }, [bills]);

    useEffect(() => {
        setYearRange([yearBounds.min, yearBounds.max]);
        setSelectedYearRange([yearBounds.min, yearBounds.max]);
    }, [yearBounds]);

    const filteredBills = categoryFilteredBills.filter(b => {
        if (b.introductionYear === null) return true;
        return b.introductionYear >= selectedYearRange[0] && b.introductionYear <= selectedYearRange[1];
    });

    const categorySubcats = selectedCategory
        ? subcategories.filter(s => s.bill_type === selectedCategory)
        : subcategories;

    return (
        <div className="p-3 md:p-6 max-w-7xl mx-auto overflow-x-hidden">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-4 md:mb-6">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-main">Policy Radar</h1>
                    <p className="text-light text-sm md:text-base mt-1 font-mono">Visualize environmental legislation by policy area</p>
                </div>
            </div>

            <div className="flex flex-col md:flex-row gap-4 md:gap-6">
                {/* Sidebar - Full width on mobile, fixed width on desktop */}
                <div className="w-full md:w-72 md:flex-shrink-0">
                    <Card variant="section" className="space-y-4 md:space-y-5">
                        {/* Category Selector */}
                        <div>
                            <label className="wf-label block mb-2">Category</label>
                            <select
                                value={selectedCategory || ''}
                                onChange={(e) => setSelectedCategory(e.target.value)}
                                className="wf-input"
                            >
                                {categories.map(cat => (
                                    <option key={cat} value={cat}>{formatCategoryName(cat)}</option>
                                ))}
                            </select>
                        </div>

                        <div className="wf-divider" />

                        {/* Statistics */}
                        <div>
                            <h3 className="wf-label mb-3">Statistics</h3>
                            <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-light">Bills in Category</span>
                                    <span className="text-lg font-bold font-mono text-main">{filteredBills.length}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-light">Subcategories</span>
                                    <span className="text-lg font-bold font-mono text-main">{categorySubcats.length}</span>
                                </div>
                            </div>
                        </div>

                        <div className="wf-divider" />

                        {/* Policy Areas */}
                        <div>
                            <h3 className="wf-label mb-3">Policy Areas</h3>
                            <div className="flex flex-wrap gap-1.5">
                                {categorySubcats.map(s => (
                                    <span
                                        key={s.subcategory}
                                        className="wf-badge"
                                    >
                                        {formatCategoryName(s.subcategory)}
                                    </span>
                                ))}
                            </div>
                        </div>

                        <div className="wf-divider" />

                        {/* How It Works - Hidden on mobile, shown on desktop */}
                        <div className="hidden md:block">
                            <h3 className="wf-label mb-3">How It Works</h3>
                            <div className="space-y-3 text-xs text-light">
                                <div>
                                    <h4 className="font-semibold text-main mb-0.5">Policy Areas (Axes)</h4>
                                    <p>Each axis represents a subcategory. Bills are positioned based on their relevance to each policy area.</p>
                                </div>
                                <div>
                                    <h4 className="font-semibold text-main mb-0.5">Similarity Scores</h4>
                                    <p>Bills are compared using <strong>cosine similarity</strong> between text embeddings. Higher scores mean stronger relevance.</p>
                                </div>
                                <div>
                                    <h4 className="font-semibold text-main mb-0.5">Clustering</h4>
                                    <p>Similar bills are grouped using <strong>K-means clustering</strong>, analyzing similarity patterns to create related groups.</p>
                                </div>
                                <div>
                                    <h4 className="font-semibold text-main mb-0.5">Position</h4>
                                    <p>Bills closer to an axis have higher relevance to that topic. Bills near the center have balanced scores across areas.</p>
                                </div>
                            </div>
                        </div>
                    </Card>
                </div>

                {/* Main Chart Area */}
                <div className="flex-1 relative min-w-0">
                    {showInstructions && (
                        <Card className="absolute top-0 left-0 z-20 w-56 md:w-64">
                            <div className="flex justify-between items-start mb-2">
                                <h3 className="font-semibold text-main">Quick Tips</h3>
                                <button
                                    onClick={dismissInstructions}
                                    className="text-light hover:text-main"
                                >
                                    ✕
                                </button>
                            </div>
                            <ul className="text-sm text-light space-y-2">
                                <li className="flex items-start">
                                    <span className="mr-2 text-accent">•</span>
                                    <span>Click clusters to view grouped bills</span>
                                </li>
                                <li className="flex items-start">
                                    <span className="mr-2 text-accent">•</span>
                                    <span>Toggle to see individual bill distribution</span>
                                </li>
                                <li className="flex items-start">
                                    <span className="mr-2 text-accent">•</span>
                                    <span>Click bills in the side panel to view details</span>
                                </li>
                            </ul>
                        </Card>
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
import { IsometricThreeBackground } from '@/components/IsometricThreeBackground'

export default function BgTestPage() {
    return (
        <>
            <IsometricThreeBackground />

            {/* Foreground content to confirm stacking works */}
            <div className="relative z-10 min-h-screen flex items-center justify-center p-8">
                <div className="wf-section max-w-md bg-main">
                    <p className="wf-label mb-2">Component Test — Three.js</p>
                    <h1 className="text-3xl font-bold text-main mb-3">Isometric Background</h1>
                    <p className="text-light text-sm">
                        14,400 cubes rendered in a single GPU draw call via InstancedMesh.
                        Smooth per-frame animation at 60fps. No DOM per cell.
                    </p>
                </div>
            </div>
        </>
    )
}

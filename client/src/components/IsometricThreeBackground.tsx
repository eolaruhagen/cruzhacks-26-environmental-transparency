'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'

// ─── Config ────────────────────────────────────────────

const GRID_SIZE = 180           // higher res for sharper leaf detail
const CELL_SIZE = 0.9
const LIFT_HEIGHT = 0.8
const LEAF_COUNT = 7
// Continuous sine/cosine drift for smooth, languid leaf movement.
// Both rise and fall are fast so the leaf silhouette stays clean (no ghost trails)
// while still giving a subtle "settle" feel via slightly slower fall.
const LEAF_SPEED = 0.1
const FAST_RISE = 0.3           // lerp coefficient when height is increasing
const FAST_FALL = 0.25          // lerp coefficient when height is decreasing

// Leaf pattern is split into BODY cells (the green flesh) and SPINE cells
// (the dark central vein). Both lift together — only their colors differ.
// Coords are [dx, dy] relative to the leaf's center cell.
//
// Shape sketch (. = body, | = spine, space = empty):
//
//      .         row -5 (tip body)
//      |         row -4 (spine tip)
//    . | .       row -3
//   .. | ..      row -2
//   .. | ..      row -1
//   .. | ..      row  0
//    . | .       row  1
//      |         row  2 (spine)
//      |         row  3 (stem)
//
// Wider middle (3 cols of body each side of spine on rows -2..0) gives a
// clearer leaf silhouette; single stem cell on rows 2-3 narrows to a point.

const LEAF_BODY: readonly [number, number][] = [
    // Complete leaf body — ALL green, no dark vein through the middle.
    // Shape (viewed top-to-bottom): narrow tip, widens through middle, narrows again.
    //
    //      X          row -5  (tip)
    //      X          row -4
    //    X X X        row -3
    //  X X X X X      row -2
    //  X X X X X      row -1
    //  X X X X X      row  0  (widest)
    //    X X X        row  1
    [0, -5],
    [0, -4],
    [-1, -3], [0, -3], [1, -3],
    [-2, -2], [-1, -2], [0, -2], [1, -2], [2, -2],
    [-2, -1], [-1, -1], [0, -1], [1, -1], [2, -1],
    [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0],
    [-1, 1], [0, 1], [1, 1],
]

// Very small dark stem below the body. Just 2 cells — visible but minimal.
const LEAF_STEM: readonly [number, number][] = [
    [0, 2], [0, 3],
]

// ─── Read theme colors from CSS vars ──────────────────
//
// Three.js doesn't know about our CSS variables, so we read them at mount and
// re-read whenever the .dark class toggles on <html>. A MutationObserver
// watches for the class change.

interface ThemePalette {
    base: THREE.Color       // unlifted tile color
    lifted: THREE.Color     // green body of lifted leaf
    stem: THREE.Color       // dark small stem at leaf base
    background: THREE.Color // scene clear color
}

function readPalette(): ThemePalette {
    const style = getComputedStyle(document.documentElement)
    const bg = style.getPropertyValue('--color-bg').trim() || '#FAFAFA'
    const card = style.getPropertyValue('--color-card').trim() || '#F5F5F3'
    const text = style.getPropertyValue('--color-text').trim() || '#1a1a1a'

    // Hard-coded vibrant greens — the CSS --color-accent is too desaturated
    // to read as "leaf" at a glance. Pick based on theme.
    const isDark = document.documentElement.classList.contains('dark')
    const leafBody = '#86efac' /* green-300 */

    return {
        base: new THREE.Color(card),
        lifted: new THREE.Color(leafBody),
        stem: new THREE.Color(text),
        background: new THREE.Color(bg),
    }
}

// ─── Component ─────────────────────────────────────────

export function IsometricThreeBackground() {
    const mountRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const mount = mountRef.current
        if (!mount) return

        // ─── Scene / camera / renderer ────────────────

        const scene = new THREE.Scene()
        const aspect = window.innerWidth / window.innerHeight
        // Smaller frustum = more zoomed in = grid fills view reliably.
        // The grid is 180 * 0.9 = 162 world units wide. Frustum at 50 means
        // we see a 50-unit-tall slice, which is always well within the grid.
        const frustumSize = 50
        const camera = new THREE.OrthographicCamera(
            -frustumSize * aspect / 2,
            frustumSize * aspect / 2,
            frustumSize / 2,
            -frustumSize / 2,
            0.1,
            1000,
        )
        // Near-top-down angle. Height dominates so the grid plane's projection
        // fills the entire orthographic frustum both vertically and
        // horizontally. Slight X/Z offset gives the "looking from upper-right"
        // isometric feel without letting the plane recede into thin bands.
        camera.position.set(1.5, 8, 2)
        camera.lookAt(0, 0, 0)

        // Use alpha: false + a solid clear color so the canvas is always fully
        // opaque. Any screen area the camera frustum doesn't cover with grid
        // cells will be painted with the clear color (= page bg), so the
        // visual effect is "grid fades into page color at the edges" rather
        // than "grid suddenly stops and reveals the page background."
        const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false })
        const bgHex = getComputedStyle(document.documentElement)
            .getPropertyValue('--color-bg').trim() || '#EDEBE4'
        renderer.setClearColor(new THREE.Color(bgHex), 1)
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
        renderer.setSize(window.innerWidth, window.innerHeight)
        renderer.domElement.style.pointerEvents = 'auto'
        renderer.domElement.style.display = 'block'
        renderer.domElement.style.width = '100%'
        renderer.domElement.style.height = '100%'
        mount.appendChild(renderer.domElement)

        // ─── Lighting ────────────────────────────────

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.7)
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8)
        dirLight.position.set(5, 10, 3)
        scene.add(ambientLight, dirLight)

        // ─── Palette — read from CSS vars ────────────

        let palette = readPalette()

        // ─── Instanced mesh ──────────────────────────

        const total = GRID_SIZE * GRID_SIZE
        const geometry = new THREE.BoxGeometry(CELL_SIZE, 0.2, CELL_SIZE)
        const material = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 0.7,
            metalness: 0.0,
        })

        const mesh = new THREE.InstancedMesh(geometry, material, total)
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
        mesh.instanceColor = new THREE.InstancedBufferAttribute(
            new Float32Array(total * 3), 3,
        )
        mesh.instanceColor.setUsage(THREE.DynamicDrawUsage)

        // Per-cell state
        const currentHeights = new Float32Array(total)
        const targetHeights = new Float32Array(total)
        // `leafRoles[i]` stores WHAT kind of lift each cell has right now:
        //   0 = not lifted, 1 = body, 2 = spine. Used to pick lifted color.
        const leafRoles = new Uint8Array(total)

        // Per-tile ambient variation (static)
        const baseHeights = new Float32Array(total)
        const baseColors = new Float32Array(total * 3)

        // Stamp helpers — write both role + target into the buffers
        const stampRole = (cx: number, cy: number, pattern: readonly [number, number][], role: 1 | 2) => {
            for (const [dx, dy] of pattern) {
                const x = cx + dx
                const y = cy + dy
                if (x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE) {
                    const i = y * GRID_SIZE + x
                    targetHeights[i] = 1
                    // Spine wins if both overlap (pattern has some overlap)
                    if (role === 2 || leafRoles[i] !== 2) {
                        leafRoles[i] = role
                    }
                }
            }
        }

        // Reusable temp objects
        const dummy = new THREE.Object3D()
        const color = new THREE.Color()

        // Initialize — position, ambient color, and ambient height
        const offset = GRID_SIZE / 2
        const initializeTiles = () => {
            for (let gy = 0; gy < GRID_SIZE; gy++) {
                for (let gx = 0; gx < GRID_SIZE; gx++) {
                    const i = gy * GRID_SIZE + gx

                    // Rolling topography — two overlapping sine waves
                    baseHeights[i] = Math.sin(gx * 0.18) * 0.04 + Math.cos(gy * 0.22) * 0.04

                    // Per-tile brightness variation applied to the palette base
                    const variance = Math.sin(gx * 1.7 + gy * 1.3) * 0.04
                    baseColors[i * 3] = palette.base.r + variance
                    baseColors[i * 3 + 1] = palette.base.g + variance
                    baseColors[i * 3 + 2] = palette.base.b + variance

                    dummy.position.set(gx - offset, baseHeights[i], gy - offset)
                    dummy.updateMatrix()
                    mesh.setMatrixAt(i, dummy.matrix)
                    color.setRGB(baseColors[i * 3], baseColors[i * 3 + 1], baseColors[i * 3 + 2])
                    mesh.setColorAt(i, color)
                }
            }
            mesh.instanceMatrix.needsUpdate = true
            if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
        }
        initializeTiles()
        scene.add(mesh)

        // ─── Watch for theme changes ─────────────────

        const themeObserver = new MutationObserver(() => {
            palette = readPalette()
            // Update clear color to match new theme's bg (dark mode swap)
            const newBgHex = getComputedStyle(document.documentElement)
                .getPropertyValue('--color-bg').trim() || '#EDEBE4'
            renderer.setClearColor(new THREE.Color(newBgHex), 1)
            // Re-seed baseColors from new palette
            for (let i = 0; i < total; i++) {
                const gx = i % GRID_SIZE
                const gy = Math.floor(i / GRID_SIZE)
                const variance = Math.sin(gx * 1.7 + gy * 1.3) * 0.04
                baseColors[i * 3] = palette.base.r + variance
                baseColors[i * 3 + 1] = palette.base.g + variance
                baseColors[i * 3 + 2] = palette.base.b + variance
            }
        })
        themeObserver.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['class'],
        })

        // ─── Pointer hover ───────────────────────────

        const raycaster = new THREE.Raycaster()
        const pointer = new THREE.Vector2()
        let pointerActive = false
        let hoveredCell: [number, number] | null = null

        const handlePointerMove = (e: PointerEvent) => {
            pointer.x = (e.clientX / window.innerWidth) * 2 - 1
            pointer.y = -(e.clientY / window.innerHeight) * 2 + 1
            pointerActive = true
        }
        const handlePointerLeave = () => {
            pointerActive = false
            hoveredCell = null
        }
        renderer.domElement.addEventListener('pointermove', handlePointerMove)
        renderer.domElement.addEventListener('pointerleave', handlePointerLeave)

        // ─── Pause on tab hidden (save battery) ──────

        let paused = false
        const handleVisibility = () => {
            paused = document.hidden
        }
        document.addEventListener('visibilitychange', handleVisibility)

        // ─── Continuous drift parameters ─────────────

        // How far a leaf's center should stay away from the visible bounding
        // box edges (in grid cells). Leaf pattern extent is ~5 cells in any
        // direction, so 7 gives a small safety buffer.
        const LEAF_MARGIN_CELLS = 7

        // ─── Animation loop ──────────────────────────

        let rafId = 0
        const startTime = performance.now()

        const animate = () => {
            rafId = requestAnimationFrame(animate)
            if (paused) return

            const elapsed = (performance.now() - startTime) / 1000

            // Raycast for hover
            if (pointerActive) {
                raycaster.setFromCamera(pointer, camera)
                const hits = raycaster.intersectObject(mesh)
                if (hits.length > 0 && hits[0].instanceId !== undefined) {
                    const id = hits[0].instanceId
                    hoveredCell = [id % GRID_SIZE, Math.floor(id / GRID_SIZE)]
                } else {
                    hoveredCell = null
                }
            }

            // Reset target + role buffers
            targetHeights.fill(0)
            leafRoles.fill(0)

            // Compute the actual visible bounding box in GRID CELL coords.
            // `camera.right - camera.left` = frustum width in world units.
            // Dividing by CELL_SIZE gives the width in cells. This updates
            // automatically on resize (handleResize rewrites camera bounds).
            const visibleCellsX = (camera.right - camera.left) / CELL_SIZE
            const visibleCellsY = (camera.top - camera.bottom) / CELL_SIZE
            const safeHalfX = Math.max(8, visibleCellsX / 2 - LEAF_MARGIN_CELLS)
            const safeHalfY = Math.max(8, visibleCellsY / 2 - LEAF_MARGIN_CELLS)

            // Multi-sine drift — each axis is the sum of two sinusoids with
            // incommensurate frequencies. The sum is bounded in [-1, 1] (since
            // 0.6 + 0.4 = 1.0 max amplitude), so scaling by safeHalf* keeps
            // leaves inside the visible box. The two different frequencies per
            // axis plus a cosine for the secondary component (vs sine for
            // primary) breaks up visible periodicity — motion reads as random.
            for (let i = 0; i < LEAF_COUNT; i++) {
                const phase = (i / LEAF_COUNT) * Math.PI * 2
                const nx =
                    0.6 * Math.sin(elapsed * LEAF_SPEED * 0.8 + phase) +
                    0.4 * Math.cos(elapsed * LEAF_SPEED * 1.9 + phase * 1.7)
                const ny =
                    0.6 * Math.cos(elapsed * LEAF_SPEED * 0.9 + phase * 1.2) +
                    0.4 * Math.sin(elapsed * LEAF_SPEED * 1.6 + phase * 2.3)
                const cx = Math.round(offset + nx * safeHalfX)
                const cy = Math.round(offset + ny * safeHalfY)
                stampRole(cx, cy, LEAF_BODY, 1)
                stampRole(cx, cy, LEAF_STEM, 2)
            }
            // Hover leaf
            if (hoveredCell) {
                stampRole(hoveredCell[0], hoveredCell[1], LEAF_BODY, 1)
                stampRole(hoveredCell[0], hoveredCell[1], LEAF_STEM, 2)
            }

            // Per-cell update: lerp height fast in BOTH directions so the
            // leaf silhouette stays clean (no ghost trails behind drifting leaves)
            for (let i = 0; i < total; i++) {
                const delta = targetHeights[i] - currentHeights[i]
                const k = delta > 0 ? FAST_RISE : FAST_FALL
                currentHeights[i] += delta * k
                const h = currentHeights[i]

                const gx = i % GRID_SIZE
                const gy = Math.floor(i / GRID_SIZE)

                dummy.position.set(gx - offset, baseHeights[i] + h * LIFT_HEIGHT, gy - offset)
                dummy.updateMatrix()
                mesh.setMatrixAt(i, dummy.matrix)

                // Pick the target color for this tile's current role
                //   0 = not lifted (uses baseColor via lerp start)
                //   1 = body (green)
                //   2 = stem (dark)
                const tgt = leafRoles[i] === 2 ? palette.stem : palette.lifted

                // Lerp from per-tile ambient base → role-specific lifted color
                color.setRGB(baseColors[i * 3], baseColors[i * 3 + 1], baseColors[i * 3 + 2])
                color.lerp(tgt, h)
                mesh.setColorAt(i, color)
            }

            mesh.instanceMatrix.needsUpdate = true
            if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true

            renderer.render(scene, camera)
        }
        animate()

        // ─── Resize ──────────────────────────────────

        const handleResize = () => {
            const newAspect = window.innerWidth / window.innerHeight
            camera.left = -frustumSize * newAspect / 2
            camera.right = frustumSize * newAspect / 2
            camera.top = frustumSize / 2
            camera.bottom = -frustumSize / 2
            camera.updateProjectionMatrix()
            renderer.setSize(window.innerWidth, window.innerHeight)
        }
        window.addEventListener('resize', handleResize)

        // ─── Cleanup ─────────────────────────────────

        return () => {
            cancelAnimationFrame(rafId)
            themeObserver.disconnect()
            window.removeEventListener('resize', handleResize)
            document.removeEventListener('visibilitychange', handleVisibility)
            renderer.domElement.removeEventListener('pointermove', handlePointerMove)
            renderer.domElement.removeEventListener('pointerleave', handlePointerLeave)
            mount.removeChild(renderer.domElement)
            geometry.dispose()
            material.dispose()
            mesh.dispose()
            renderer.dispose()
        }
    }, [])

    return (
        <div
            ref={mountRef}
            // Explicit inline dimensions instead of Tailwind's `fixed inset-0`
            // to remove any chance of Tailwind class ordering or specificity
            // issues cutting the height short. 100vw/100vh + position:fixed
            // guarantees full viewport coverage regardless of scroll.
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100vw',
                height: '100vh',
                zIndex: 0,
                pointerEvents: 'none',
                filter: 'blur(0.5px)',
            }}
        />
    )
}

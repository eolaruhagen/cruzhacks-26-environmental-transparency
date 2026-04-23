'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import leafConfig from '@/lib/leaf-templates.json'


const CONFIG = {
    verticalBias: 0.4,
    gridSize: 300,
    cellSize: 0.90,
    liftHeight: .8,
    leafCount: 9,
    driftSpeed: 0.05,
    marginCells: 7,
    riseSpeed: 0.25,
    fallSpeed: 0.2,
    frustumSize: 80,
    sceneBackgroundLight: '#595959',
    sceneBackgroundDark: '#000000',
}

function pickSceneBackground(): string {
    const isDark = document.documentElement.classList.contains('dark')
    return isDark ? CONFIG.sceneBackgroundDark : CONFIG.sceneBackgroundLight
}

const TEMPLATE_SIZE: number = leafConfig.templateSize

interface LeafConfigCell {
    x: number
    y: number
    color: string
}
interface LeafConfigTemplate {
    name: string
    cells: LeafConfigCell[]
}

interface LeafCell {
    dx: number
    dy: number
    color: THREE.Color
}

type LeafShape = LeafCell[]

function parseLeafTemplate(template: LeafConfigTemplate): LeafShape {
    const center = Math.floor(TEMPLATE_SIZE / 2)
    return template.cells
        .filter(c => c.x >= 0 && c.x < TEMPLATE_SIZE && c.y >= 0 && c.y < TEMPLATE_SIZE)
        .map(c => ({
            dx: c.x - center,
            dy: c.y - center,
            color: new THREE.Color(c.color),
        }))
}

// ─── Tile patterns ─────────────────────────────────────
//
// A tile pattern is a size x size grid of painted cells that repeats across
// the ground. Each cell stores a LIGHT-mode and DARK-mode color so the ground
// follows the page theme. The first pattern in the JSON is the active one.

interface TilePatternCellConfig {
    x: number
    y: number
    light: string
    dark: string
}
interface TilePatternConfigEntry {
    name: string
    cells: TilePatternCellConfig[]
}

interface ParsedTilePattern {
    size: number
    light: (THREE.Color | null)[]
    dark: (THREE.Color | null)[]
}

function parseActiveTilePattern(): ParsedTilePattern | null {
    const size = (leafConfig as { tilePatternSize?: number }).tilePatternSize
    const patterns = (leafConfig as { tilePatterns?: TilePatternConfigEntry[] }).tilePatterns
    if (!size || !patterns || patterns.length === 0) return null
    const count = size * size
    const light: (THREE.Color | null)[] = new Array(count).fill(null)
    const dark: (THREE.Color | null)[] = new Array(count).fill(null)
    for (const cell of patterns[0].cells) {
        if (cell.x < 0 || cell.x >= size || cell.y < 0 || cell.y >= size) continue
        const idx = cell.y * size + cell.x
        light[idx] = new THREE.Color(cell.light)
        dark[idx] = new THREE.Color(cell.dark)
    }
    return { size, light, dark }
}

// ─── Theme ─────────────────────────────────────────────

interface ThemeColors {
    tileBase: THREE.Color
    background: THREE.Color
}

function readTheme(): ThemeColors {
    const style = getComputedStyle(document.documentElement)
    const bg = style.getPropertyValue('--color-bg').trim() || '#FAFAFA'
    const card = style.getPropertyValue('--color-card').trim() || '#F5F5F3'
    return {
        tileBase: new THREE.Color(card),
        background: new THREE.Color(bg),
    }
}

// ─── Component ─────────────────────────────────────────

export function IsometricThreeBackground() {
    const mountRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const mount = mountRef.current
        if (!mount) return

        const parsedShapes = leafConfig.templates.map(parseLeafTemplate)
        const pickRandomShape = () =>
            parsedShapes[Math.floor(Math.random() * parsedShapes.length)]
        const driftingShapes: LeafShape[] = Array.from(
            { length: CONFIG.leafCount },
            pickRandomShape,
        )
        const hoverShape: LeafShape = parsedShapes[0]

        // ─── Scene / camera / renderer ────────────────

        const applyCameraBounds = (cam: THREE.OrthographicCamera, aspect: number) => {
            const halfHeight = CONFIG.frustumSize / 2
            const biasWorld = CONFIG.frustumSize * CONFIG.verticalBias
            cam.left = -CONFIG.frustumSize * aspect / 2
            cam.right = CONFIG.frustumSize * aspect / 2
            cam.top = halfHeight + biasWorld
            cam.bottom = -halfHeight + biasWorld
            cam.updateProjectionMatrix()
        }

        const scene = new THREE.Scene()
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000)
        applyCameraBounds(camera, window.innerWidth / window.innerHeight)
        camera.position.set(1.5, 8, 2)
        camera.lookAt(0, 0, 0)

        const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false })
        renderer.setClearColor(new THREE.Color(pickSceneBackground()), 1)
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

        // ─── Tile mesh ───────────────────────────────

        let theme = readTheme()
        const tileCount = CONFIG.gridSize * CONFIG.gridSize
        const geometry = new THREE.BoxGeometry(CONFIG.cellSize, 0.2, CONFIG.cellSize)
        const material = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 0.7,
            metalness: 0.0,
        })
        const mesh = new THREE.InstancedMesh(geometry, material, tileCount)
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
        mesh.instanceColor = new THREE.InstancedBufferAttribute(
            new Float32Array(tileCount * 3), 3,
        )
        mesh.instanceColor.setUsage(THREE.DynamicDrawUsage)

        // ─── Per-tile buffers ────────────────────────

        const currentHeights = new Float32Array(tileCount)
        const targetHeights = new Float32Array(tileCount)
        const leafColors = new Float32Array(tileCount * 3)
        const ambientHeights = new Float32Array(tileCount)
        const ambientColors = new Float32Array(tileCount * 3)

        const dummy = new THREE.Object3D()
        const tileColor = new THREE.Color()
        const leafTargetColor = new THREE.Color()

        const originOffset = CONFIG.gridSize / 2

        const computeDriftCenterCells = (): { x: number; y: number } => {
            const ray = new THREE.Raycaster()
            ray.setFromCamera(new THREE.Vector2(0, 0), camera)
            const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
            const hit = new THREE.Vector3()
            if (!ray.ray.intersectPlane(ground, hit)) {
                return { x: originOffset, y: originOffset }
            }
            return {
                x: originOffset + hit.x / CONFIG.cellSize,
                y: originOffset + hit.z / CONFIG.cellSize,
            }
        }
        const driftCenter = computeDriftCenterCells()

        const activeTilePattern = parseActiveTilePattern()

        const seedAmbientFromTheme = () => {
            const isDark = document.documentElement.classList.contains('dark')
            const patternGrid = activeTilePattern
                ? (isDark ? activeTilePattern.dark : activeTilePattern.light)
                : null
            const patternSize = activeTilePattern?.size ?? 0

            for (let i = 0; i < tileCount; i++) {
                const gx = i % CONFIG.gridSize
                const gy = Math.floor(i / CONFIG.gridSize)
                const variance = Math.sin(gx * 1.7 + gy * 1.3) * 0.04

                let baseR = theme.tileBase.r
                let baseG = theme.tileBase.g
                let baseB = theme.tileBase.b

                if (patternGrid) {
                    const cell = patternGrid[(gy % patternSize) * patternSize + (gx % patternSize)]
                    if (cell) {
                        baseR = cell.r
                        baseG = cell.g
                        baseB = cell.b
                    }
                }

                ambientColors[i * 3] = baseR + variance
                ambientColors[i * 3 + 1] = baseG + variance
                ambientColors[i * 3 + 2] = baseB + variance
            }
        }

        const initializeTiles = () => {
            for (let i = 0; i < tileCount; i++) {
                const gx = i % CONFIG.gridSize
                const gy = Math.floor(i / CONFIG.gridSize)
                ambientHeights[i] = Math.sin(gx * 0.18) * 0.04 + Math.cos(gy * 0.22) * 0.04
                dummy.position.set(gx - originOffset, ambientHeights[i], gy - originOffset)
                dummy.updateMatrix()
                mesh.setMatrixAt(i, dummy.matrix)
                tileColor.setRGB(
                    ambientColors[i * 3],
                    ambientColors[i * 3 + 1],
                    ambientColors[i * 3 + 2],
                )
                mesh.setColorAt(i, tileColor)
            }
            mesh.instanceMatrix.needsUpdate = true
            if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
        }
        seedAmbientFromTheme()
        initializeTiles()
        scene.add(mesh)

        // ─── Theme reactivity ────────────────────────

        const themeObserver = new MutationObserver(() => {
            theme = readTheme()
            renderer.setClearColor(new THREE.Color(pickSceneBackground()), 1)
            seedAmbientFromTheme()
        })
        themeObserver.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['class'],
        })

        // ─── Stamping ────────────────────────────────

        const stampLeaf = (cx: number, cy: number, cells: LeafShape) => {
            for (const { dx, dy, color } of cells) {
                const x = cx + dx
                const y = cy + dy
                if (x < 0 || x >= CONFIG.gridSize || y < 0 || y >= CONFIG.gridSize) continue
                const i = y * CONFIG.gridSize + x
                targetHeights[i] = 1
                leafColors[i * 3] = color.r
                leafColors[i * 3 + 1] = color.g
                leafColors[i * 3 + 2] = color.b
            }
        }

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

        // ─── Visibility pause ────────────────────────

        let paused = false
        const handleVisibility = () => { paused = document.hidden }
        document.addEventListener('visibilitychange', handleVisibility)

        // ─── Animation loop ──────────────────────────

        let rafId = 0
        const startTime = performance.now()

        const driftPosition = (leafIndex: number, elapsed: number, safeHalfX: number, safeHalfY: number) => {
            const phase = (leafIndex / CONFIG.leafCount) * Math.PI * 2
            const nx =
                0.6 * Math.sin(elapsed * CONFIG.driftSpeed * 0.8 + phase) +
                0.4 * Math.cos(elapsed * CONFIG.driftSpeed * 1.9 + phase * 1.7)
            const ny =
                0.6 * Math.cos(elapsed * CONFIG.driftSpeed * 0.9 + phase * 1.2) +
                0.4 * Math.sin(elapsed * CONFIG.driftSpeed * 1.6 + phase * 2.3)
            return {
                cx: Math.round(driftCenter.x + nx * safeHalfX),
                cy: Math.round(driftCenter.y + ny * safeHalfY),
            }
        }

        const animate = () => {
            rafId = requestAnimationFrame(animate)
            if (paused) return

            const elapsed = (performance.now() - startTime) / 1000

            if (pointerActive) {
                raycaster.setFromCamera(pointer, camera)
                const hits = raycaster.intersectObject(mesh)
                if (hits.length > 0 && hits[0].instanceId !== undefined) {
                    const id = hits[0].instanceId
                    hoveredCell = [id % CONFIG.gridSize, Math.floor(id / CONFIG.gridSize)]
                } else {
                    hoveredCell = null
                }
            }

            targetHeights.fill(0)

            const visibleCellsX = (camera.right - camera.left) / CONFIG.cellSize
            const visibleCellsY = (camera.top - camera.bottom) / CONFIG.cellSize
            const safeHalfX = Math.max(8, visibleCellsX / 2 - CONFIG.marginCells)
            const safeHalfY = Math.max(8, visibleCellsY / 2 - CONFIG.marginCells)

            for (let i = 0; i < CONFIG.leafCount; i++) {
                const { cx, cy } = driftPosition(i, elapsed, safeHalfX, safeHalfY)
                stampLeaf(cx, cy, driftingShapes[i])
            }
            if (hoveredCell) stampLeaf(hoveredCell[0], hoveredCell[1], hoverShape)

            for (let i = 0; i < tileCount; i++) {
                const delta = targetHeights[i] - currentHeights[i]
                const k = delta > 0 ? CONFIG.riseSpeed : CONFIG.fallSpeed
                currentHeights[i] += delta * k
                const h = currentHeights[i]

                const gx = i % CONFIG.gridSize
                const gy = Math.floor(i / CONFIG.gridSize)

                dummy.position.set(
                    gx - originOffset,
                    ambientHeights[i] + h * CONFIG.liftHeight,
                    gy - originOffset,
                )
                dummy.updateMatrix()
                mesh.setMatrixAt(i, dummy.matrix)

                tileColor.setRGB(
                    ambientColors[i * 3],
                    ambientColors[i * 3 + 1],
                    ambientColors[i * 3 + 2],
                )
                leafTargetColor.setRGB(
                    leafColors[i * 3],
                    leafColors[i * 3 + 1],
                    leafColors[i * 3 + 2],
                )
                tileColor.lerp(leafTargetColor, h)
                mesh.setColorAt(i, tileColor)
            }

            mesh.instanceMatrix.needsUpdate = true
            if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true

            renderer.render(scene, camera)
        }
        animate()

        // ─── Resize ──────────────────────────────────

        const handleResize = () => {
            applyCameraBounds(camera, window.innerWidth / window.innerHeight)
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
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100vw',
                height: '100vh',
                zIndex: 0,
                pointerEvents: 'none',
                filter: '',
            }}
        />
    )
}

'use client'

import {useEffect, useRef, useState} from 'react'
import * as THREE from 'three'
import { ThreeScene } from './ThreeScene'
import leafConfig from '@/lib/leaf-templates.json'


// DONT FORGET: X: +x = right, -x = left, Y: +y = up, -y = down, Z: +z = forward, -z = backward (into screen)

const CONFIG = {
    // grid layout
    columnsRelativeSize: 0.009,    // cell width as fraction of window width
    cellGap: 2,                     // pixels between cell edges
    padWidth: 1.6,                  // grid extends past viewport (×width)
    padHeight: 1.8,                 // grid extends past viewport (×height)
    cubeDepth: 8,                   // box thickness along z
    baseZ: -200,                    // resting tile z-depth
    sceneBackgroundLight: '#595959',
    sceneBackgroundDark: '#000000',
    baseColorLight: 0xb5bdb6,
    baseColorDark: 0x2a2f33,
    cubeMaterialColor: 0xb5bdb6,    // base material color (multiplies with instanceColor)
    cameraRotation: { x: 25, y: 15, z: 9 },
    cameraPosition: { x: 85, y: -55, z: 200 },
    sunPosition: { x: 1, y: 2, z: 3 },
    sunIntensity: 3,
    ambientIntensity: 0.6,
    leafCount: 11,
    moveIntervalMin: 1.5,           // seconds between moves (per-leaf, randomized)
    moveIntervalMax: 2.8,
    lift: 12,                        // z-offset for a lit tile
    minLeafBuffer: 3,                // min Chebyshev distance between any two leaves' cells
    enterDuration: 0.3,
    leaveDuration: 0.3,
    maxTiltRad: 0.25,        // peak tilt angle during enter/leave
    veilDark:  { r: 28,  g: 25,  b: 23,  a: 0.6 },   // stone-900-ish, heavy
    veilLight: { r: 245, g: 240, b: 230, a: 0.25 },  // warm wash, light haze
}

const BASE_COLOR_LIGHT = new THREE.Color(CONFIG.baseColorLight)
const BASE_COLOR_DARK = new THREE.Color(CONFIG.baseColorDark)


class Window {
    readonly width: number
    readonly height: number
    readonly paddedWidth: number
    readonly paddedHeight: number
    constructor(window: globalThis.Window) {
        this.width = window.innerWidth
        this.height = window.innerHeight
        this.paddedWidth = window.innerWidth * CONFIG.padWidth
        this.paddedHeight = window.innerHeight * CONFIG.padHeight
    }

    /** returns the width of a square cell */
    public getCellDims(): number {
        return this.width * CONFIG.columnsRelativeSize
    }
}

type LeafCellRelativePositions = {
    dx: number
    dy: number
    color: THREE.Color
}

type LeafCellAbsolutePositions = {
    x: number
    y: number
    color: THREE.Color
}

type MovementDirection = 'up' | 'down' | 'left' | 'right'

type ColorOrResolver = THREE.Color | (() => THREE.Color)

function resolveColor(c: ColorOrResolver): THREE.Color {
    return typeof c === 'function' ? c() : c
}

type TileAnimationContext = {
    elapsed: number          // seconds since the animation started
    fromZ: number            // z-offset (delta from BASE_Z) at start
    toZ: number              // z-offset target
    fromColor: THREE.Color
    toColor: ColorOrResolver // function form re-resolves each tick (e.g. theme-current base)
    direction?: MovementDirection | null   // for tilt; null/undefined = no tilt
}

type ScheduleAnimationParams = Omit<TileAnimationContext, 'elapsed'>

type TileAnimationResult = {
    zOffset: number
    color: THREE.Color
    rotX?: number            // pitch around x-axis (radians); defaults to 0
    rotY?: number            // pitch around y-axis (radians); defaults to 0
    done?: boolean           // true on the final frame; registry should cull after applying
}

type TileAnimation = (ctx: TileAnimationContext) => TileAnimationResult


const BACK_C1 = 1.70158
const BACK_C3 = BACK_C1 + 1

function easeOutBack(t: number): number {
    const u = t - 1
    return 1 + BACK_C3 * u * u * u + BACK_C1 * u * u
}

/** Map a leaf's movement direction to a unit tilt vector (rotX, rotY).
 *  Sign convention chosen so the +z face leans IN the direction of motion. */
function directionTilt(direction: MovementDirection | null | undefined): {rotX: number, rotY: number} {
    if (!direction) return { rotX: 0, rotY: 0 }
    switch (direction) {
        case 'right': return { rotX: 0, rotY: 1 }
        case 'left':  return { rotX: 0, rotY: -1 }
        case 'up':    return { rotX: -1, rotY: 0 }
        case 'down':  return { rotX: 1, rotY: 0 }
    }
}

/** Cell joining the pattern: rises with overshoot (easeOutBack), tilts in the
 *  leaf's direction of motion (peaks mid-animation, returns to upright at end),
 *  color lerps to the leaf cell's color. */
const tileEnterAnimation: TileAnimation = (ctx) => {
    const t = Math.min(ctx.elapsed / CONFIG.enterDuration, 1)
    const easedZ = easeOutBack(t)
    const zOffset = ctx.fromZ + (ctx.toZ - ctx.fromZ) * easedZ
    const to = resolveColor(ctx.toColor)
    const color = ctx.fromColor.clone().lerp(to, t)
    const tiltAmt = 4 * t * (1 - t)            // 0 → peak at 0.5 → 0
    const dir = directionTilt(ctx.direction)
    const rotX = tiltAmt * CONFIG.maxTiltRad * dir.rotX
    const rotY = tiltAmt * CONFIG.maxTiltRad * dir.rotY
    if (t >= 1) {
        return { zOffset: ctx.toZ, color: to.clone(), rotX: 0, rotY: 0, done: true }
    }
    return { zOffset, color, rotX, rotY }
}

/** Cell leaving the pattern: drops with overshoot (hyperpolarization bounce),
 *  tilts in motion direction, color lerps back to base (lazily resolved so
 *  theme changes mid-leave land on the new base). */
const tileLeaveAnimation: TileAnimation = (ctx) => {
    const t = Math.min(ctx.elapsed / CONFIG.leaveDuration, 1)
    const easedZ = easeOutBack(t)
    const zOffset = ctx.fromZ + (ctx.toZ - ctx.fromZ) * easedZ
    const to = resolveColor(ctx.toColor)
    const color = ctx.fromColor.clone().lerp(to, t)
    const tiltAmt = 4 * t * (1 - t)
    const dir = directionTilt(ctx.direction)
    const rotX = tiltAmt * CONFIG.maxTiltRad * dir.rotX
    const rotY = tiltAmt * CONFIG.maxTiltRad * dir.rotY
    if (t >= 1) {
        return { zOffset: ctx.toZ, color: to.clone(), rotX: 0, rotY: 0, done: true }
    }
    return { zOffset, color, rotX, rotY }
}

type LeafConfigCell = { x: number; y: number; color: string }
type LeafConfigTemplate = { name: string; cells: LeafConfigCell[] }

const TEMPLATE_SIZE: number = leafConfig.templateSize

function parseLeafTemplate(template: LeafConfigTemplate): LeafCellRelativePositions[] {
    const center = Math.floor(TEMPLATE_SIZE / 2)
    return template.cells
        .filter(c => c.x >= 0 && c.x < TEMPLATE_SIZE && c.y >= 0 && c.y < TEMPLATE_SIZE)
        .map(c => ({
            dx: c.x - center,
            dy: center - c.y,                // flip vertically: JSON y grows down, world y grows up
            color: new THREE.Color(c.color),
        }))
}

type TilePatternCellConfig = { x: number; y: number; light: string; dark: string }
type TilePatternConfigEntry = { name: string; cells: TilePatternCellConfig[] }

type ParsedTilePattern = {
    size: number
    light: (THREE.Color | null)[]
    dark: (THREE.Color | null)[]
}

function parseActiveTilePattern(): ParsedTilePattern | null {
    const cfg = leafConfig as { tilePatternSize?: number; tilePatterns?: TilePatternConfigEntry[] }
    if (!cfg.tilePatternSize || !cfg.tilePatterns?.length) return null
    const size = cfg.tilePatternSize
    const count = size * size
    const light: (THREE.Color | null)[] = new Array(count).fill(null)
    const dark: (THREE.Color | null)[] = new Array(count).fill(null)
    for (const cell of cfg.tilePatterns[0].cells) {
        if (cell.x < 0 || cell.x >= size || cell.y < 0 || cell.y >= size) continue
        const idx = cell.y * size + cell.x
        light[idx] = new THREE.Color(cell.light)
        dark[idx] = new THREE.Color(cell.dark)
    }
    return { size, light, dark }
}

const leafTemplates: LeafCellRelativePositions[][] = (leafConfig.templates as LeafConfigTemplate[]).map(parseLeafTemplate)
const pickRandomTemplate = (): LeafCellRelativePositions[] =>
    leafTemplates[Math.floor(Math.random() * leafTemplates.length)]


class LeafPatternInstance {
    readonly pattern: LeafCellRelativePositions[]
    readonly size: number
    public priority: number = 0       // higher wins on tile collision; assigned by caller
    public moveInterval: number = 1.5 // seconds between moves; assigned per-instance
    private centerCell: {x: number, y: number} | null = null
    private lastMovement: MovementDirection | null = null
    private _moveAccumulator: number = 0
    private activePatternCells: LeafCellAbsolutePositions[] | null = null
    public lastStepActiveCells: LeafCellAbsolutePositions[] | null = null

    // tile animations
    public enterAnimation: TileAnimation = () => ({ zOffset: 0, color: new THREE.Color(0x000000), done: true })
    public leaveAnimation: TileAnimation = () => ({ zOffset: 0, color: new THREE.Color(0x000000), done: true })

    constructor(pattern: LeafCellRelativePositions[], size: number) {
        this.pattern = pattern
        this.size = size
        this._moveAccumulator = Math.random() * this.moveInterval
    }

    /** Initializes the center cell of the pattern
     * - Random location on the board based on the rows and cols
     * - Initialized centercell cannot be closer than `this.size` cells from the edge of the board
     * - If `others` is provided, retries up to 100 times to find a position whose cells
     *   stay >= CONFIG.minLeafBuffer Chebyshev distance from every other leaf's cells.
     *   Falls back to a random position if no clear spot is found.
     */
    public initCenterCell(rows: number, cols: number, others: LeafPatternInstance[] = []) {
        const minX = this.size
        const maxX = cols - this.size
        const minY = this.size
        const maxY = rows - this.size
        const pickRandom = () => ({
            x: Math.floor(Math.random() * (maxX - minX + 1)) + minX,
            y: Math.floor(Math.random() * (maxY - minY + 1)) + minY,
        })
        for (let attempt = 0; attempt < 100; attempt++) {
            const candidate = pickRandom()
            if (!this._wouldCollideAtCenter(candidate, others)) {
                this.centerCell = candidate
                return
            }
        }
        this.centerCell = pickRandom()  // fallback: place anyway
    }

    /** Advance this leaf's clock; return true if it should move this frame. */
    public tick(dt: number): boolean {
        this._moveAccumulator += dt
        if (this._moveAccumulator < this.moveInterval) return false
        this._moveAccumulator = 0
        return true
    }

    public getLastMovement(): MovementDirection | null {
        return this.lastMovement
    }

    private _cellsAtCenter(center: {x: number, y: number}): LeafCellAbsolutePositions[] {
        return this.pattern.map(cell => ({
            x: cell.dx + center.x,
            y: cell.dy + center.y,
            color: cell.color,
        }))
    }

    private _getCellsInPattern(): LeafCellAbsolutePositions[] {
        if (!this.centerCell) return []
        return this._cellsAtCenter(this.centerCell)
    }

    /** Cells this leaf currently occupies. Falls back to computing from centerCell
     *  if the leaf hasn't moved yet (init-time collision checks need this). */
    public getCells(): LeafCellAbsolutePositions[] {
        if (this.activePatternCells) return this.activePatternCells
        if (!this.centerCell) return []
        return this._cellsAtCenter(this.centerCell)
    }

    private _proposedCenter(dir: MovementDirection): {x: number, y: number} {
        const c = this.centerCell!
        switch (dir) {
            case 'left':  return { x: c.x - 1, y: c.y }
            case 'right': return { x: c.x + 1, y: c.y }
            case 'up':    return { x: c.x, y: c.y + 1 }
            case 'down':  return { x: c.x, y: c.y - 1 }
        }
    }

    /** True if placing this leaf at `center` would put any of its cells within
     *  CONFIG.minLeafBuffer (Chebyshev) of any other leaf's cells. */
    private _wouldCollideAtCenter(center: {x: number, y: number}, others: LeafPatternInstance[]): boolean {
        const buffer = CONFIG.minLeafBuffer
        const myCells = this._cellsAtCenter(center)
        for (const other of others) {
            if (other === this) continue
            const otherCells = other.getCells()
            if (otherCells.length === 0) continue
            for (const a of myCells) {
                for (const b of otherCells) {
                    if (Math.abs(a.x - b.x) < buffer && Math.abs(a.y - b.y) < buffer) return true
                }
            }
        }
        return false
    }

    private _getValidMovements(rows: number, cols: number): MovementDirection[] {
        if (!this.centerCell) return []
        const validMovements: MovementDirection[] = []
        if (this.centerCell.x > this.size) validMovements.push('left')
        if (this.centerCell.x < cols - this.size) validMovements.push('right')
        // NOT SURE ON THESE: dont actually know whether up means +y or -y yet
        if (this.centerCell.y > this.size) validMovements.push('up')
        if (this.centerCell.y < rows - this.size) validMovements.push('down')
        return validMovements
    }

    private _serializePositions(patternCells: LeafCellAbsolutePositions[]): Set<string> {
        return new Set(patternCells.map(cell => `${cell.x},${cell.y}`))
    }


    /** Once A movement has been applied, compute the tiles that have LEFT the pattern, tiles that have joined the pattern, and tiles that stayed but changed color */
    private _computeStepDiffs(): {left: Set<LeafCellAbsolutePositions>, joined: Set<LeafCellAbsolutePositions>, colorChanged: Set<LeafCellAbsolutePositions>} {
        if (!this.activePatternCells) return {left: new Set(), joined: new Set(), colorChanged: new Set()}
        // First move has no previous cells — treat as empty so every current cell becomes "joined"
        if (!this.lastStepActiveCells) this.lastStepActiveCells = []
        // create a hash map of the current active cells to map positions to colors -> returned sets should be LeafCellAbsolutePositions instead of strings
        const activeCellsColorMap = new Map<string, THREE.Color>()
        for (const cell of this.activePatternCells) {
            activeCellsColorMap.set(`${cell.x},${cell.y}`, cell.color)
        }

        const lastStepCellsColorMap = new Map<string, THREE.Color>()
        for (const cell of this.lastStepActiveCells) {
            lastStepCellsColorMap.set(`${cell.x},${cell.y}`, cell.color)
        }

        const serializedPrevious = this._serializePositions(this.lastStepActiveCells)
        const serializedCurrent = this._serializePositions(this.activePatternCells)

        const left = new Set<string>()
        const joined = new Set<string>()

        for (const cell of serializedPrevious) {
            if (!serializedCurrent.has(cell)) {
                left.add(cell)
            }
        }
        for (const cell of serializedCurrent) {
            if (!serializedPrevious.has(cell)) {
                joined.add(cell)
            }
        }

        // map colors back to each one -> left means not in previous, joined means not in current, take old color for left, new color for joined
        const leftPatternCells: Set<LeafCellAbsolutePositions> = new Set()
        for (const cell of left) {
            const color = lastStepCellsColorMap.get(cell)!
            leftPatternCells.add({x: Number(cell.split(',')[0]), y: Number(cell.split(',')[1]), color})
        }

        const joinedPatternCells: Set<LeafCellAbsolutePositions> = new Set()
        for (const cell of joined) {
            const color = activeCellsColorMap.get(cell)!
            joinedPatternCells.add({x: Number(cell.split(',')[0]), y: Number(cell.split(',')[1]), color})
        }

        // cells that exist in both sets but the color changed
        const colorChangedCells: Set<LeafCellAbsolutePositions> = new Set()
        for (const cell of serializedCurrent) {
            if (!serializedPrevious.has(cell)) continue
            const newColor = activeCellsColorMap.get(cell)!
            const oldColor = lastStepCellsColorMap.get(cell)!
            if (!newColor.equals(oldColor)) {
                colorChangedCells.add({x: Number(cell.split(',')[0]), y: Number(cell.split(',')[1]), color: newColor})
            }
        }

        return {left: leftPatternCells, joined: joinedPatternCells, colorChanged: colorChangedCells}
    }

    /** Move the cell over one unit in a random direction preferes, but does not guarantee movement in the last taken direction
     * - When the last movement is still allowed, it is 2x more likely to be chosen
     * - Applies the movement when finished.
     * - If no movement is allowed, nothing happens
     */
    public move(rows: number, cols: number, others: LeafPatternInstance[] = []): {left: Set<LeafCellAbsolutePositions>, joined: Set<LeafCellAbsolutePositions>, colorChanged: Set<LeafCellAbsolutePositions>} {
        // filter out movements that would push us within CONFIG.minLeafBuffer of another leaf
        const validMovements = this._getValidMovements(rows, cols).filter(dir =>
            !this._wouldCollideAtCenter(this._proposedCenter(dir), others)
        )
        if (validMovements.length === 0) return {left: new Set(), joined: new Set(), colorChanged: new Set()}
        let chosenMovement: MovementDirection
        if (this.lastMovement && validMovements.includes(this.lastMovement)) {
            validMovements.push(this.lastMovement)
            validMovements.push(this.lastMovement)// second instance of lastMovement makes it 2x more likely
        }
        if ('left' in validMovements) validMovements.push('right')
        if ('right' in validMovements) validMovements.push('left')
        chosenMovement = validMovements[Math.floor(Math.random() * validMovements.length)]
        this.lastMovement = chosenMovement
        switch (chosenMovement) {
            case 'left':
                this.centerCell!.x--
                break
            case 'right':
                this.centerCell!.x++
                break
            case 'up':
                this.centerCell!.y++
                break
            case 'down':
                this.centerCell!.y--
                break
        }
        this.lastStepActiveCells = this.activePatternCells
        this.activePatternCells = this._getCellsInPattern()

        return this._computeStepDiffs()
    }

    /** clamp leaf center cell to fit grid */
    public clampToGrid(rows: number, cols: number) {
        if (!this.centerCell) return
        const minX = this.size
        const maxX = cols - this.size
        const minY = this.size
        const maxY = rows - this.size
        // Grid too small to host this leaf → leave centerCell as-is, blank out cells.
        if (maxX < minX || maxY < minY) {
            this.activePatternCells = null
            return
        }
        this.centerCell.x = Math.max(minX, Math.min(maxX, this.centerCell.x))
        this.centerCell.y = Math.max(minY, Math.min(maxY, this.centerCell.y))
        this.activePatternCells = this._getCellsInPattern()
    }

    /** Does this leaf currently include the cell at (x, y) in its active pattern? */
    public includesCell(x: number, y: number): boolean {
        if (!this.activePatternCells) return false
        return this.activePatternCells.some(c => c.x === x && c.y === y)
    }

    /** Color this leaf assigns to (x, y), or null if it doesn't include that cell. */
    public getColorAtCell(x: number, y: number): THREE.Color | null {
        if (!this.activePatternCells) return null
        const c = this.activePatternCells.find(c => c.x === x && c.y === y)
        return c ? c.color : null
    }
}


class TileGrid {
    public mesh: THREE.InstancedMesh
    public cols: number
    public rows: number
    readonly baseZ: number
    private readonly _scene: THREE.Scene
    private readonly _matrix = new THREE.Matrix4()
    private readonly _scratchEuler = new THREE.Euler()
    private readonly _leafPatternInstances: LeafPatternInstance[] = []
    private readonly _animations: Map<number, {
        animation: TileAnimation
        animationParams: ScheduleAnimationParams
        elapsed: number
    }> = new Map()
    private readonly _owners: Map<number, LeafPatternInstance> = new Map()
    private _isDark: boolean = false
    private _basePattern: ParsedTilePattern | null = null

    constructor(scene: THREE.Scene, windowSize: Window, baseZ: number) {
        const { cols, rows } = this._getDims(windowSize)
        this._scene = scene
        this.cols = cols
        this.rows = rows
        this.baseZ = baseZ
        this.mesh = createCubesInstancedMesh(scene, windowSize, rows, cols, baseZ)
        this._applyBaseColors()
    }

    /** Set whether we're in dark mode + optional repeating pattern. Re-colors
     *  every non-animating non-owned tile to its new base color. Animating
     *  tiles use lazy toColor; owned-static tiles keep their leaf color. */
    public setTheme(isDark: boolean, pattern: ParsedTilePattern | null = this._basePattern) {
        this._isDark = isDark
        this._basePattern = pattern
        this._applyBaseColors()
    }

    /** Get the base color this tile should be at rest, given current theme + pattern. */
    public getBaseColorAt(row: number, col: number): THREE.Color {
        const idx = this._indexOf(col, row)
        return this._baseColorForIdx(idx)
    }

    private _baseColorForIdx(idx: number): THREE.Color {
        const fallback = this._isDark ? BASE_COLOR_DARK : BASE_COLOR_LIGHT
        if (!this._basePattern) return fallback
        const col = Math.floor(idx / this.rows)
        const row = idx % this.rows
        const px = ((col % this._basePattern.size) + this._basePattern.size) % this._basePattern.size
        const py = ((row % this._basePattern.size) + this._basePattern.size) % this._basePattern.size
        const patternIdx = py * this._basePattern.size + px
        const arr = this._isDark ? this._basePattern.dark : this._basePattern.light
        return arr[patternIdx] ?? fallback
    }

    private _applyBaseColors() {
        for (let i = 0; i < this.mesh.count; i++) {
            if (this._animations.has(i)) continue
            if (this._owners.has(i)) continue
            this.mesh.setColorAt(i, this._baseColorForIdx(i))
        }
        if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true
    }


    public addLeafPatternInstance(leafPatternInstance: LeafPatternInstance) {
        this._leafPatternInstances.push(leafPatternInstance)
    }

    public getLeafPatternInstances(): LeafPatternInstance[] {
        return this._leafPatternInstances
    }

    private _setTileColorAt(row: number, col: number, color: THREE.Color) {
        const idx = this._indexOf(col, row)
        if (idx < 0 || idx >= this.mesh.count) return
        this.mesh.setColorAt(idx, color)
        if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true
    }

    /** Apply z-offset + tilt to a tile while preserving its (x, y). Reads x/y
     *  out of the existing matrix (set once at mesh creation), rebuilds rotation
     *  via reusable scratch euler, then re-applies translation. */
    private _setTileTransform(idx: number, z: number, rotX: number, rotY: number) {
        this.mesh.getMatrixAt(idx, this._matrix)
        const e = this._matrix.elements
        const x = e[12]
        const y = e[13]
        this._scratchEuler.set(rotX, rotY, 0)
        this._matrix.makeRotationFromEuler(this._scratchEuler)
        this._matrix.setPosition(x, y, z)
        this.mesh.setMatrixAt(idx, this._matrix)
    }

    private _indexOf(col: number, row: number): number {
        return col * this.rows + row
    }

    /**
     * Gets the dimensions of the tile grid in terms of rows and columns for cells
     * @param window The window to get the dimensions from
     * @returns The dimensions of the tile grid
     */
    private _getDims(window: Window) {
        const step = window.getCellDims() + CONFIG.cellGap
        const cols = Math.ceil(window.paddedWidth / step)
        const rows = Math.ceil(window.paddedHeight / step)
        return { cols, rows }
    }

    /** Rebuild Mesh on Window Resize 
     *  - Rebuilds mesh
     *  - Resets animations
     *  - Re-stamps leaf pattern instances
    */
    public resizeBoard(windowSize: Window = new Window(globalThis.window)): Window {
        this._scene.remove(this.mesh)
        this.mesh.geometry.dispose()
        if (Array.isArray(this.mesh.material)) {
            for (const m of this.mesh.material) m.dispose()
        } else {
            this.mesh.material.dispose()
        }
        this.mesh.dispose()

        const { cols, rows } = this._getDims(windowSize)
        this.cols = cols
        this.rows = rows
        this.mesh = createCubesInstancedMesh(this._scene, windowSize, rows, cols, this.baseZ)
        this._animations.clear()
        this._owners.clear()

        this._applyBaseColors()


        // apply each leaf back fo the board, ordered by priority so that visible leaf follow ownership rules
        const ordered = [...this._leafPatternInstances].sort((a, b) => a.priority - b.priority)
        for (const leaf of ordered) {
            leaf.clampToGrid(rows, cols)
            const cells = leaf.getCells()
            for (const cell of cells) {
                if (cell.x < 0 || cell.x >= cols || cell.y < 0 || cell.y >= rows) continue
                const idx = this._indexOf(cell.x, cell.y)
                if (idx < 0 || idx >= this.mesh.count) continue
                this._owners.set(idx, leaf)
                this._setTileTransform(idx, this.baseZ + CONFIG.lift, 0, 0)
                this.mesh.setColorAt(idx, cell.color)
            }
        }
        this.mesh.instanceMatrix.needsUpdate = true
        if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true

        return windowSize
    }

    /** Schedule an animation for one tile. The new animation ALWAYS starts from
     *  the tile's current visual state (z and color) — caller's fromZ/fromColor
     *  are advisory and get overridden. This makes every handoff smooth, whether
     *  there was a prior animation, a static lit tile, or a fresh base tile. */
    private _scheduleAnimation(row: number, col: number, animation: TileAnimation, animationParams: ScheduleAnimationParams) {
        const idx = this._indexOf(col, row)
        if (idx < 0 || idx >= this.mesh.count) return

        this.mesh.getMatrixAt(idx, this._matrix)
        const currentZ = this._matrix.elements[14] - this.baseZ
        const currentColor = new THREE.Color()
        if (this.mesh.instanceColor) this.mesh.getColorAt(idx, currentColor)
        const params = { ...animationParams, fromZ: currentZ, fromColor: currentColor }

        this._animations.set(idx, { animation, animationParams: params, elapsed: 0 })
    }

    /** Highest-priority leaf (other than `exclude`) that currently includes (col, row). */
    private _findCurrentOccupant(col: number, row: number, exclude?: LeafPatternInstance): LeafPatternInstance | null {
        let best: LeafPatternInstance | null = null
        for (const leaf of this._leafPatternInstances) {
            if (exclude && leaf === exclude) continue
            if (!leaf.includesCell(col, row)) continue
            if (!best || leaf.priority > best.priority) best = leaf
        }
        return best
    }

    /** A leaf wants to claim this tile. Wins iff no strictly-higher-priority owner. */
    public requestEnter(
        row: number, col: number, leaf: LeafPatternInstance,
        color: THREE.Color, animation: TileAnimation, lift: number,
        direction: MovementDirection | null,
    ) {
        const idx = this._indexOf(col, row)
        if (idx < 0 || idx >= this.mesh.count) return
        const current = this._owners.get(idx)
        // skip the animation scheduling if this leaf isnt allowed to take ownership
        if (current && current !== leaf && current.priority > leaf.priority) return
        this._owners.set(idx, leaf)
        this._scheduleAnimation(row, col, animation, {
            fromZ: 0, toZ: lift,
            fromColor: this._baseColorForIdx(idx),  // overridden by snapshot
            toColor: color,
            direction,
        })
    }

    /** A leaf is releasing this tile. If another leaf still occupies it,
     *  hand off to that leaf's color (stay lifted). Otherwise, drop to base —
     *  with a LAZY toColor so theme changes mid-leave land on the new base. */
    public requestLeave(
        row: number, col: number, leaf: LeafPatternInstance,
        animation: TileAnimation, lift: number,
        direction: MovementDirection | null,
    ) {
        const idx = this._indexOf(col, row)
        if (idx < 0 || idx >= this.mesh.count) return
        const current = this._owners.get(idx)
        if (current !== leaf) return  // we weren't the visible owner; nothing to do

        // note: both fromColor's passed in here, are overwritten with the current mesh colors
        // inside of _scheduleAnimation, its arbitrary
        const next = this._findCurrentOccupant(col, row, leaf)
        if (next) {
            this._owners.set(idx, next)
            const nextColor = next.getColorAtCell(col, row) ?? this._baseColorForIdx(idx)
            this._scheduleAnimation(row, col, animation, {
                fromZ: lift, toZ: lift,                            // stay lifted
                fromColor: this._baseColorForIdx(idx),              // overridden by snapshot
                toColor: nextColor,
                direction,
            })
        } else {
            this._owners.delete(idx)
            this._scheduleAnimation(row, col, animation, {
                fromZ: lift, toZ: 0,
                fromColor: this._baseColorForIdx(idx),              // overridden by snapshot
                toColor: () => this._baseColorForIdx(idx),          // lazy: theme-current at finish
                direction,
            })
        }
    }

    /** change color: only honored if this leaf is current owner. */
    public requestRecolor(row: number, col: number, leaf: LeafPatternInstance, color: THREE.Color) {
        const idx = this._indexOf(col, row)
        if (idx < 0 || idx >= this.mesh.count) return
        const current = this._owners.get(idx)
        // make sure its actually the owning leaf
        if (current && current !== leaf) return
        this._owners.set(idx, leaf)
        this._setTileColorAt(row, col, color)
    }

    /** use dt to run all current animations and apply them to the tiles
     * - Assumes that all animations exist in accordance to leaf ownership rules
    */
    public runPendingAnimations(dt: number) {
        if (this._animations.size === 0) return

        for (const [idx, entry] of this._animations) {
            entry.elapsed += dt
            const result = entry.animation({
                ...entry.animationParams,
                elapsed: entry.elapsed,
            })
            this._setTileTransform(idx, this.baseZ + result.zOffset, result.rotX ?? 0, result.rotY ?? 0)
            this.mesh.setColorAt(idx, result.color)
            if (result.done) this._animations.delete(idx)
        }

        this.mesh.instanceMatrix.needsUpdate = true
        if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true
    }

}


function isDarkMode(): boolean {
    return document.documentElement.classList.contains('dark')
}

function feedThemeObserver(canvas: ThreeScene, tileGrid: TileGrid) {
    canvas.setBgColor(pickSceneBackground)
    tileGrid.setTheme(isDarkMode())
}


function pickSceneBackground(): string {
    return isDarkMode() ? CONFIG.sceneBackgroundDark : CONFIG.sceneBackgroundLight
}


/** Creates the base box geometry + lambert material for the tile cubes. */
function createCube(window: Window): {geometry: THREE.BufferGeometry, material: THREE.Material} {
    const cellWidth = window.getCellDims()
    return {
        geometry: new THREE.BoxGeometry(cellWidth, cellWidth, CONFIG.cubeDepth),
        material: new THREE.MeshLambertMaterial({ color: CONFIG.cubeMaterialColor }),
    }
}

/** Creates an instanced mesh of cubes to fill the scene. */
function createCubesInstancedMesh(scene: THREE.Scene, windowSize: Window, rows: number, cols: number, baseZ: number): THREE.InstancedMesh {
    const step = windowSize.getCellDims() + CONFIG.cellGap
    const cellCount = rows * cols
    const { geometry, material } = createCube(windowSize)
    const instancedMesh = new THREE.InstancedMesh(geometry, material, cellCount)

    const halfW = windowSize.paddedWidth / 2
    const halfH = windowSize.paddedHeight / 2

    const m = new THREE.Matrix4()
    let i = 0
    for (let col = 0; col < cols; col++) {
        for (let row = 0; row < rows; row++) {
            m.setPosition(col * step - halfW, row * step - halfH, baseZ)
            instancedMesh.setMatrixAt(i, m)
            i++
        }
    }

    instancedMesh.instanceMatrix.needsUpdate = true
    scene.add(instancedMesh)
    return instancedMesh
}

export default function MovingLeafBg() {
    const mountRef = useRef<HTMLDivElement>(null)
    const [dark, setDark] = useState(false)

    useEffect(() => {
        setDark(isDarkMode())
        const themeWatcher = new MutationObserver(() => setDark(isDarkMode()))
        themeWatcher.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
        return () => themeWatcher.disconnect()
    }, [])

    useEffect(() => {
        if (!mountRef.current) return
        const mount = mountRef.current
        const windowSize = new Window(window)

        const canvas = new ThreeScene()
            .withOrthographicCamera(windowSize.width, windowSize.height)
            .withRenderer(windowSize.width, windowSize.height, true)
            //.withAxesHelper()
            .build()

        if (!canvas.camera || !canvas.renderer) {
            console.error('Camera or renderer not initialized')
            return
        }

        canvas.setBgColor(pickSceneBackground)
        const tileGrid = new TileGrid(canvas.scene, windowSize, CONFIG.baseZ)
        tileGrid.setTheme(isDarkMode(), parseActiveTilePattern())
        const observer = new MutationObserver(() => feedThemeObserver(canvas, tileGrid))
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
        window.addEventListener('resize', () => {
            const fresh = tileGrid.resizeBoard()   // returns the new Window
            canvas.renderer!.setSize(fresh.width, fresh.height)
        })

        for (let i = 0; i < CONFIG.leafCount; i++) {
            const leaf = new LeafPatternInstance(pickRandomTemplate(), Math.ceil(TEMPLATE_SIZE / 2))
            leaf.priority = i   // later-instantiated leaves win on collision
            leaf.moveInterval = CONFIG.moveIntervalMin + Math.random() * (CONFIG.moveIntervalMax - CONFIG.moveIntervalMin)
            leaf.enterAnimation = tileEnterAnimation
            leaf.leaveAnimation = tileLeaveAnimation
            leaf.initCenterCell(tileGrid.rows, tileGrid.cols, tileGrid.getLeafPatternInstances())
            tileGrid.addLeafPatternInstance(leaf)
        }


        const sun = new THREE.DirectionalLight(0xffffff, CONFIG.sunIntensity)
        sun.position.set(CONFIG.sunPosition.x, CONFIG.sunPosition.y, CONFIG.sunPosition.z)
        canvas.scene.add(sun)
        canvas.scene.add(new THREE.AmbientLight(0xffffff, CONFIG.ambientIntensity))

        canvas.applyCameraRotation(CONFIG.cameraRotation.x, CONFIG.cameraRotation.y, CONFIG.cameraRotation.z)
        canvas.applyCameraPosition(CONFIG.cameraPosition.x, CONFIG.cameraPosition.y, CONFIG.cameraPosition.z)

        canvas.renderer.setSize(windowSize.width, windowSize.height)
        mount.appendChild(canvas.renderer.domElement)


        const clock = new THREE.Timer()

        const animate = () => {
            requestAnimationFrame(animate)
            const dt = clock.getDelta()

            // Phase 1: tick each leaf's clock; collect those that should move this frame
            const allLeaves = tileGrid.getLeafPatternInstances()
            const moves: Array<{ leaf: LeafPatternInstance, diffs: ReturnType<LeafPatternInstance['move']> }> = []
            for (const leaf of allLeaves) {
                if (leaf.tick(dt)) {
                    moves.push({ leaf, diffs: leaf.move(tileGrid.rows, tileGrid.cols, allLeaves) })
                }
            }
            // Phase 2: route diffs through ownership-aware request methods
            for (const { leaf, diffs } of moves) {
                const direction = leaf.getLastMovement()
                const { left, joined, colorChanged } = diffs
                for (const cell of left) {
                    tileGrid.requestLeave(cell.y, cell.x, leaf, leaf.leaveAnimation, CONFIG.lift, direction)
                }
                for (const cell of joined) {
                    tileGrid.requestEnter(cell.y, cell.x, leaf, cell.color, leaf.enterAnimation, CONFIG.lift, direction)
                }
                for (const cell of colorChanged) {
                    tileGrid.requestRecolor(cell.y, cell.x, leaf, cell.color)
                }
            }

            tileGrid.runPendingAnimations(dt)
            clock.update()
            canvas.renderer?.render(canvas.scene, canvas.camera!)
        }
        animate()

        return () => {
            mount?.removeChild(canvas.renderer?.domElement!) // not sure how im feeling about this NN assertion
            canvas.dismount()
        }



    }, [])

    // canvas + a sibling veil overlay (rgba inline + theme-driven so it can shift with dark/light)
    const veil = dark ? CONFIG.veilDark : CONFIG.veilLight
    return (
        <div className="fixed inset-0 z-0">
            <div ref={mountRef} className="absolute inset-0" />
            <div
                className="absolute inset-0 pointer-events-none transition-colors duration-300"
                style={{ backgroundColor: `rgba(${veil.r}, ${veil.g}, ${veil.b}, ${veil.a})` }}
            />
        </div>
    )
}

'use client'

import {useEffect, useRef} from 'react'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { ThreeScene } from './ThreeScene'
import leafConfig from '@/lib/leaf-templates.json'


// DONT FORGET: X: +x = right, -x = left, Y: +y = up, -y = down, Z: +z = forward, -z = backward (into screen)

const CONFIG = {
    columnsRelativeSize: 0.0095, // relative to the width of the screen ~ 1.5% -> row relative size calculated on the fly s.t its even
    sceneBackgroundLight: '#595959',
    sceneBackgroundDark: '#000000',
    padHeight: 1.5,
    padWidth: 1.2,
    cellGap: 2,
    enterDuration: 0.5,
    leaveDuration: 0.5,
}


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
}

type ScheduleAnimationParams = Omit<TileAnimationContext, 'elapsed'>

type TileAnimationResult = {
    zOffset: number
    color: THREE.Color
    done?: boolean           // true on the final frame; registry should cull after applying
}

type TileAnimation = (ctx: TileAnimationContext) => TileAnimationResult



const BACK_C1 = 1.70158
const BACK_C3 = BACK_C1 + 1

function easeInBack(t: number): number {
    return BACK_C3 * t * t * t - BACK_C1 * t * t
}

function easeOutBack(t: number): number {
    const u = t - 1
    return 1 + BACK_C3 * u * u * u + BACK_C1 * u * u
}

/** Cell joining the pattern: rises past the target lift, then settles back down.
 *  Color lerps linearly from current color to the leaf cell's color. */
const tileEnterAnimation: TileAnimation = (ctx) => {
    const t = Math.min(ctx.elapsed / CONFIG.enterDuration, 1)
    const easedZ = easeOutBack(t)
    const zOffset = ctx.fromZ + (ctx.toZ - ctx.fromZ) * easedZ
    const to = resolveColor(ctx.toColor)
    const color = ctx.fromColor.clone().lerp(to, t)
    if (t >= 1) {
        return { zOffset: ctx.toZ, color: to.clone(), done: true }
    }
    return { zOffset, color }
}

/** Cell leaving the pattern: drops past the base height (hyperpolarization
 *  bounce), then settles back to base. Color lerps back to the base color. */
const tileLeaveAnimation: TileAnimation = (ctx) => {
    const t = Math.min(ctx.elapsed / CONFIG.leaveDuration, 1)
    const easedZ = easeOutBack(t)
    const zOffset = ctx.fromZ + (ctx.toZ - ctx.fromZ) * easedZ
    const to = resolveColor(ctx.toColor)
    const color = ctx.fromColor.clone().lerp(to, t)
    if (t >= 1) {
        return { zOffset: ctx.toZ, color: to.clone(), done: true }
    }
    return { zOffset, color }
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
    public priority: number = 0   // higher wins on tile collision; assigned by caller
    private centerCell: {x: number, y: number} | null = null
    private lastMovement: MovementDirection | null = null
    private activePatternCells: LeafCellAbsolutePositions[] | null = null
    public lastStepActiveCells: LeafCellAbsolutePositions[] | null = null
    
    // tile animations
    public enterAnimation: TileAnimation = () => { return { zOffset: 0, color: new THREE.Color(0x000000), done: true } }
    public leaveAnimation: TileAnimation = () => { return { zOffset: 0, color: new THREE.Color(0x000000), done: true } }

    constructor(pattern: LeafCellRelativePositions[], size: number) {
        this.pattern = pattern
        this.size = size
    }
    
    /** Initializes the center cell of the pattern
     * - Random location on the board based on the rows and cols
     * - Initialized centercell cannot be closer than `this.size` cells from the edge of the board
     */
    public initCenterCell(rows: number, cols: number) {
        const minX = this.size
        const maxX = cols - this.size
        const minY = this.size
        const maxY = rows - this.size
        this.centerCell = {x: Math.floor(Math.random() * (maxX - minX + 1)) + minX, y: Math.floor(Math.random() * (maxY - minY + 1)) + minY}
    }

    public getCenterCell(): {x: number, y: number} | null {
        return this.centerCell
    }

    private _getCellsInPattern(): LeafCellAbsolutePositions[] {
        if (!this.centerCell) return []
        return this.pattern.map(cell => {
            return {
                x: cell.dx + this.centerCell!.x,
                y: cell.dy + this.centerCell!.y,
                color: cell.color,
            }
        })
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

    public move(rows: number, cols: number): {left: Set<LeafCellAbsolutePositions>, joined: Set<LeafCellAbsolutePositions>, colorChanged: Set<LeafCellAbsolutePositions>} {
        const validMovements = this._getValidMovements(rows, cols)
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

    public getActivePatternCells(): LeafCellAbsolutePositions[] | null {
        return this.activePatternCells
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

const BASE_Z = -200
const BASE_COLOR_LIGHT = new THREE.Color(0xb5bdb6)
const BASE_COLOR_DARK = new THREE.Color(0x2a2f33)

class TileGrid {
    readonly mesh: THREE.InstancedMesh
    readonly cols: number
    readonly rows: number
    readonly baseZ: number
    private readonly _matrix = new THREE.Matrix4()
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
        this.cols = cols
        this.rows = rows
        this.baseZ = baseZ
        this.mesh = createCubesInstancedMesh(scene, windowSize, rows, cols, baseZ)
        this._applyBaseColors()
    }

    /** Set whether we're in dark mode + optional repeating pattern. Re-colors
     *  every non-animating tile to its new base color. Animating tiles will
     *  pick up the new base color naturally when their leave animation lands. */
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

    private _setTileZ(idx: number, z: number) {
        this.mesh.getMatrixAt(idx, this._matrix)
        const e = this._matrix.elements
        this._matrix.setPosition(e[12], e[13], z)
        this.mesh.setMatrixAt(idx, this._matrix)
    }

    private _indexOf(col: number, row: number): number {
        return col * this.rows + row
    }

    /**
     * Gets the dimensions of the tile grid in terms of rows and columns for cells
     * - 
     * @param window The window to get the dimensions from
     * @returns The dimensions of the tile grid
     */
    private _getDims(window: Window) {
        const step = window.getCellDims() + CONFIG.cellGap
        const cols = Math.ceil(window.paddedWidth / step)
        const rows = Math.ceil(window.paddedHeight / step)
        return { cols, rows }
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
    public requestEnter(row: number, col: number, leaf: LeafPatternInstance, color: THREE.Color, animation: TileAnimation, lift: number) {
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
        })
    }

    /** A leaf is releasing this tile. If another leaf still occupies it,
     *  hand off to that leaf's color (stay lifted). Otherwise, drop to base —
     *  with a LAZY toColor so theme changes mid-leave land on the new base. */
    public requestLeave(row: number, col: number, leaf: LeafPatternInstance, animation: TileAnimation, lift: number) {
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
            })
        } else {
            this._owners.delete(idx)
            this._scheduleAnimation(row, col, animation, {
                fromZ: lift, toZ: 0,
                fromColor: this._baseColorForIdx(idx),              // overridden by snapshot
                toColor: () => this._baseColorForIdx(idx),          // lazy: theme-current at finish
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
            this._setTileZ(idx, this.baseZ + result.zOffset)
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


/** Creates the Base roundedBoxGeometry to be used by Mesh or InstancedMesh */
function createCube(window: Window): {geometry: RoundedBoxGeometry, material: THREE.Material} {
    const cellWidth = window.getCellDims()
    return {
        geometry: new THREE.BoxGeometry(cellWidth, cellWidth, 9),
        material: new THREE.MeshLambertMaterial({ color: 0xb5bdb6 })
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

    useEffect(() => {
        if (!mountRef.current) return
        const mount = mountRef.current
        const currentWindow = window
        const windowSize = new Window(currentWindow)

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
        const tileGrid = new TileGrid(canvas.scene, windowSize, BASE_Z)
        tileGrid.setTheme(isDarkMode(), parseActiveTilePattern())
        const observer = new MutationObserver(() => feedThemeObserver(canvas, tileGrid))
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
        for (let i = 0; i < 10; i++) {
            const leafPatternInstance = new LeafPatternInstance(pickRandomTemplate(), Math.ceil(TEMPLATE_SIZE / 2))
            leafPatternInstance.priority = i   // later-instantiated leaves win on collision
            leafPatternInstance.enterAnimation = tileEnterAnimation
            leafPatternInstance.leaveAnimation = tileLeaveAnimation
            leafPatternInstance.initCenterCell(tileGrid.rows, tileGrid.cols)
            tileGrid.addLeafPatternInstance(leafPatternInstance)
        }


        const sun = new THREE.DirectionalLight(0xffffff, 3)
        sun.position.set(1, 2, 3)
        canvas.scene.add(sun)
        canvas.scene.add(new THREE.AmbientLight(0xffffff, 0.6))

        canvas.applyCameraRotation(25, 15, 9)
        canvas.applyCameraPosition(50, -50, 200)
        

        canvas.renderer.setSize(windowSize.width, windowSize.height)
        mountRef.current.appendChild(canvas.renderer.domElement) 

        
        const MOVE_INTERVAL = 1.8
        const LIFT = 8
        const clock = new THREE.Timer()
        let timeSinceMove = 0

        const animate = () => {
            requestAnimationFrame(animate)
            const dt = clock.getDelta()
            timeSinceMove += dt

            if (timeSinceMove > MOVE_INTERVAL) {
                timeSinceMove = 0
                // Phase 1: move every leaf so includesCell reflects new positions before diffs run
                const moves = tileGrid.getLeafPatternInstances().map(leaf => ({
                    leaf,
                    diffs: leaf.move(tileGrid.rows, tileGrid.cols),
                }))
                // Phase 2: route diffs through ownership-aware request methods
                for (const { leaf, diffs } of moves) {
                    const { left, joined, colorChanged } = diffs
                    for (const cell of left) {
                        tileGrid.requestLeave(cell.y, cell.x, leaf, leaf.leaveAnimation, LIFT)
                    }
                    for (const cell of joined) {
                        tileGrid.requestEnter(cell.y, cell.x, leaf, cell.color, leaf.enterAnimation, LIFT)
                    }
                    for (const cell of colorChanged) {
                        tileGrid.requestRecolor(cell.y, cell.x, leaf, cell.color)
                    }
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

    return (
        <div ref={mountRef} className="fixed inset-0 z-0" />
    )
}
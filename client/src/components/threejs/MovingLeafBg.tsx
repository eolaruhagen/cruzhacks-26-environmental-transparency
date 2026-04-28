'use client'

import {useEffect, useRef} from 'react'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { ThreeScene } from './ThreeScene'


// DONT FORGET: X: +x = right, -x = left, Y: +y = up, -y = down, Z: +z = forward, -z = backward (into screen)

const CONFIG = {
    columnsRelativeSize: 0.0095, // relative to the width of the screen ~ 1.5% -> row relative size calculated on the fly s.t its even
    sceneBackgroundLight: '#595959',
    sceneBackgroundDark: '#000000',
    padHeight: 2,
    padWidth: 1.2,
    cellGap: 2,
    animationSpeed: 1,
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

type TileAnimationContext = {
    elapsed: number          // seconds since the animation started
    fromZ: number            // z-offset (delta from BASE_Z) at start
    toZ: number              // z-offset target
    fromColor: THREE.Color
    toColor: THREE.Color
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

const ENTER_DURATION = 0.4   // seconds
const LEAVE_DURATION = 0.5

/** Cell joining the pattern: rises past the target lift, then settles back down.
 *  Color lerps linearly from current color to the leaf cell's color. */
const tileEnterAnimation: TileAnimation = (ctx) => {
    const t = Math.min(ctx.elapsed / ENTER_DURATION, 1)
    const easedZ = easeOutBack(t)
    const zOffset = ctx.fromZ + (ctx.toZ - ctx.fromZ) * easedZ
    const color = ctx.fromColor.clone().lerp(ctx.toColor, t)
    if (t >= 1) {
        return { zOffset: ctx.toZ, color: ctx.toColor.clone(), done: true }
    }
    return { zOffset, color }
}

/** Cell leaving the pattern: drops past the base height (hyperpolarization
 *  bounce), then settles back to base. Color lerps back to the base color. */
const tileLeaveAnimation: TileAnimation = (ctx) => {
    const t = Math.min(ctx.elapsed / LEAVE_DURATION, 1)
    const easedZ = easeOutBack(t)
    const zOffset = ctx.fromZ + (ctx.toZ - ctx.fromZ) * easedZ
    const color = ctx.fromColor.clone().lerp(ctx.toColor, t)
    if (t >= 1) {
        return { zOffset: ctx.toZ, color: ctx.toColor.clone(), done: true }
    }
    return { zOffset, color }
}

/** A test leaf pattern, just a simple cross shape with a light green color on the tiles */
const testLeaf: LeafCellRelativePositions[] = [
    {dx: 0, dy: 0, color: new THREE.Color('#00ff00')},
    {dx: 1, dy: 0, color: new THREE.Color('#00ff00')},
    {dx: -1, dy: 0, color: new THREE.Color('#00ff00')},
    {dx: 0, dy: 1, color: new THREE.Color('#00ff00')},
    {dx: 0, dy: -1, color: new THREE.Color('#00ff00')},
]


class LeafPatternInstance {
    readonly pattern: LeafCellRelativePositions[]
    readonly size: number
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

    // private _deserializePositions(serializedPositions: Set<string>): LeafCellAbsolutePositions[] {
    //     return Array.from(serializedPositions).map(cell => {
    //         const [dx, dy] = cell.split(',').map(Number)
    //         return {dx, dy, color: BASE_COLOR}
    //     })
    // }

    /** Once A movement has been applied, compute the tiles that have LEFT the pattern and tiles that have joined the pattern */
    private _computeStepDiffs(): {left: Set<LeafCellAbsolutePositions>, joined: Set<LeafCellAbsolutePositions>} {
        if (!this.activePatternCells) return {left: new Set(), joined: new Set()}
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
        return {left: leftPatternCells, joined: joinedPatternCells}
    }

    /** Move the cell over one unit in a random direction preferes, but does not guarantee movement in the last taken direction
     * - When the last movement is still allowed, it is 2x more likely to be chosen
     * - Applies the movement when finished. 
     * - If no movement is allowed, nothing happens
     */

    public move(rows: number, cols: number): {left: Set<LeafCellAbsolutePositions>, joined: Set<LeafCellAbsolutePositions>} {
        const validMovements = this._getValidMovements(rows, cols)
        if (validMovements.length === 0) return {left: new Set(), joined: new Set()}
        let chosenMovement: MovementDirection
        if (this.lastMovement && validMovements.includes(this.lastMovement)) {
            validMovements.push(this.lastMovement) // second instance of lastMovement makes it 2x more likely
        }
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
}

const BASE_Z = -200
const BASE_COLOR = new THREE.Color(0xb5bdb6)

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
    private readonly _scratchColor = new THREE.Color()

    constructor(scene: THREE.Scene, windowSize: Window, baseZ: number) {
        const { cols, rows } = this._getDims(windowSize)
        this.cols = cols
        this.rows = rows
        this.baseZ = baseZ
        this.mesh = createCubesInstancedMesh(scene, windowSize, rows, cols, baseZ)

        // initialize per-instance color buffer so setColorAt works
        for (let i = 0; i < this.mesh.count; i++) {
            this.mesh.setColorAt(i, BASE_COLOR)
        }
        if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true
    }


    public addLeafPatternInstance(leafPatternInstance: LeafPatternInstance) {
        this._leafPatternInstances.push(leafPatternInstance)
    }

    public getLeafPatternInstances(): LeafPatternInstance[] {
        return this._leafPatternInstances
    }

    /** instantly snap the tile to the lifted z and given color */
    public activateTile(row: number, col: number, lift: number, color: THREE.Color) {
        const idx = this._indexOf(col, row)
        if (idx < 0 || idx >= this.mesh.count) return
        this._setTileZ(idx, BASE_Z + lift)
        this.mesh.setColorAt(idx, color)
        this.mesh.instanceMatrix.needsUpdate = true
        if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true
    }

    public setTileColorAt(row: number, col: number, color: THREE.Color) {
        const idx = this._indexOf(col, row)
        if (idx < 0 || idx >= this.mesh.count) return
        this.mesh.setColorAt(idx, color)
        if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true
    }

    /** instantly snap the tile back to base z and base color */
    public deactivateTile(row: number, col: number) {
        const idx = this._indexOf(col, row)
        if (idx < 0 || idx >= this.mesh.count) return
        this._setTileZ(idx, BASE_Z)
        this.mesh.setColorAt(idx, BASE_COLOR)
        this.mesh.instanceMatrix.needsUpdate = true
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

    /** Schedule an animation for one tile. If that tile already has an in-flight
     *  animation, it gets replaced — and the new animation starts from the tile's
     *  *current* z and color (not the caller's stated fromZ/fromColor) so the
     *  visual handoff is smooth, no snap. */
    public scheduleAnimation(row: number, col: number, animation: TileAnimation, animationParams: ScheduleAnimationParams) {
        const idx = this._indexOf(col, row)
        if (idx < 0 || idx >= this.mesh.count) return

        let params = animationParams
        if (this._animations.has(idx)) {
            this.mesh.getMatrixAt(idx, this._matrix)
            const currentZ = this._matrix.elements[14] - this.baseZ
            const currentColor = new THREE.Color()
            if (this.mesh.instanceColor) this.mesh.getColorAt(idx, currentColor)
            params = { ...animationParams, fromZ: currentZ, fromColor: currentColor }
        }

        this._animations.set(idx, { animation, animationParams: params, elapsed: 0 })
    }

    /** Tick every in-flight animation by `dt`, apply its result to the mesh*/
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


function feedThemeObserver(canvas: ThreeScene) {
    canvas.setBgColor(pickSceneBackground)
}


function pickSceneBackground(): string {
    const isDark = document.documentElement.classList.contains('dark')
    return isDark ? CONFIG.sceneBackgroundDark : CONFIG.sceneBackgroundLight
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
        const observer = new MutationObserver(() => feedThemeObserver(canvas))
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
        const tileGrid = new TileGrid(canvas.scene, windowSize, BASE_Z)
        for (let i = 0; i < 25; i++) {
            const leafPatternInstance = new LeafPatternInstance(testLeaf, 3)
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
        canvas.applyCameraPosition(60, 0, 200)
        

        canvas.renderer.setSize(windowSize.width, windowSize.height)
        mountRef.current.appendChild(canvas.renderer.domElement) 

        
        const MOVE_INTERVAL = 0.9
        const LIFT = 10
        const clock = new THREE.Timer()
        let timeSinceMove = 0

        const animate = () => {
            requestAnimationFrame(animate)
            const dt = clock.getDelta()
            timeSinceMove += dt

            if (timeSinceMove > MOVE_INTERVAL) {
                timeSinceMove = 0
                for (const leaf of tileGrid.getLeafPatternInstances()) {
                    const { left, joined } = leaf.move(tileGrid.rows, tileGrid.cols)

                    for (const cell of left) {
                        tileGrid.scheduleAnimation(cell.y, cell.x, leaf.leaveAnimation, {
                            fromZ: LIFT, toZ: 0,
                            fromColor: cell.color, toColor: BASE_COLOR,
                        })
                    }
                    for (const cell of joined) {
                        tileGrid.scheduleAnimation(cell.y, cell.x, leaf.enterAnimation, {
                            fromZ: 0, toZ: LIFT,
                            fromColor: BASE_COLOR, toColor: cell.color,
                        })
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
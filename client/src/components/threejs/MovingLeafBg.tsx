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
}

function pickSceneBackground(): string {
    const isDark = document.documentElement.classList.contains('dark')
    return isDark ? CONFIG.sceneBackgroundDark : CONFIG.sceneBackgroundLight
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

type LeafCell = {
    dx: number
    dy: number
    color: THREE.Color
}

type MovementDirection = 'up' | 'down' | 'left' | 'right'

/** A test leaf pattern, just a simple cross shape with a light green color on the tiles */
const testLeaf: LeafCell[] = [
    {dx: 0, dy: 0, color: new THREE.Color('#00ff00')},
    {dx: 1, dy: 0, color: new THREE.Color('#00ff00')},
    {dx: -1, dy: 0, color: new THREE.Color('#00ff00')},
    {dx: 0, dy: 1, color: new THREE.Color('#00ff00')},
    {dx: 0, dy: -1, color: new THREE.Color('#00ff00')},
]


class LeafPatternInstance {
    readonly pattern: LeafCell[]
    readonly size: number
    private centerCell: {x: number, y: number} | null = null
    private lastMovement: MovementDirection | null = null
    private activePatternCells: LeafCell[] | null = null
    constructor(pattern: LeafCell[], size: number) {
        this.pattern = pattern
        this.size = size
    }

    public getPattern(): LeafCell[] {
        return this.pattern
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

    private _getCellsInPattern(): LeafCell[] {
        if (!this.centerCell) return []
        return this.pattern.map(cell => {
            return {
                dx: cell.dx + this.centerCell!.x,
                dy: cell.dy + this.centerCell!.y,
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

    /** Move the cell over one unit in a random direction preferes, but does not guarantee movement in the last taken direction
     * - When the last movement is still allowed, it is 2x more likely to be chosen
     * - Applies the movement when finished. 
     * - If no movement is allowed, nothing happens
     */

    public move(rows: number, cols: number) {
        const validMovements = this._getValidMovements(rows, cols)
        if (validMovements.length === 0) return
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
        this.activePatternCells = this._getCellsInPattern()
    }

    public getActivePatternCells(): LeafCell[] | null {
        return this.activePatternCells
    }
}

const BASE_Z = -200
const BASE_COLOR = new THREE.Color(0xb5bdb6)

class TileGrid {
    readonly mesh: THREE.InstancedMesh
    readonly cols: number
    readonly rows: number
    private readonly _matrix = new THREE.Matrix4()
    private readonly _leafPatternInstances: LeafPatternInstance[] = []

    constructor(scene: THREE.Scene, windowSize: Window) {
        const { cols, rows } = this._getDims(windowSize)
        this.cols = cols
        this.rows = rows
        this.mesh = createCubesInstancedMesh(scene, windowSize, rows, cols)

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
}


function feedThemeObserver(canvas: ThreeScene) {
    canvas.setBgColor(pickSceneBackground)
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
function createCubesInstancedMesh(scene: THREE.Scene, windowSize: Window, rows: number, cols: number): THREE.InstancedMesh {
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
            m.setPosition(col * step - halfW, row * step - halfH, -200)
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
            throw new Error('Camera or renderer not initialized')
        }

        canvas.setBgColor(pickSceneBackground)
        const observer = new MutationObserver(() => feedThemeObserver(canvas))
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
        const tileGrid = new TileGrid(canvas.scene, windowSize)
        for (let i = 0; i < 25; i++) {
            const leafPatternInstance = new LeafPatternInstance(testLeaf, 3)
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

        
        const MOVE_INTERVAL = 0.3
        const LIFT = 10
        const clock = new THREE.Clock()
        let timeSinceMove = 0

        const animate = () => {
            requestAnimationFrame(animate)
            const dt = clock.getDelta()
            timeSinceMove += dt
            if (timeSinceMove > MOVE_INTERVAL) {
                timeSinceMove = 0
                for (const leaf of tileGrid.getLeafPatternInstances()) {
                    const oldCells = leaf.getActivePatternCells() ?? []
                    for (const cell of oldCells) {
                        tileGrid.deactivateTile(cell.dx, cell.dy)
                    }


                    leaf.move(tileGrid.rows, tileGrid.cols)

                    const newCells = leaf.getActivePatternCells() ?? []
                    for (const cell of newCells) {
                        tileGrid.activateTile(cell.dx, cell.dy, LIFT, cell.color)
                    }
                }
            }
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
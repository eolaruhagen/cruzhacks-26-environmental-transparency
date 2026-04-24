'use client'

import {useEffect, useRef} from 'react'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';


// DONT FORGET: X: +x = right, -x = left, Y: +y = up, -y = down, Z: +z = forward, -z = backward (into screen)

const CONFIG = {
    columnsRelativeSize: 0.015, // relative to the width of the screen ~ 1.5% -> row relative size calculated on the fly s.t its even
    sceneBackgroundLight: '#595959',
    sceneBackgroundDark: '#000000',
}

function pickSceneBackground(): string {
    const isDark = document.documentElement.classList.contains('dark')
    return isDark ? CONFIG.sceneBackgroundDark : CONFIG.sceneBackgroundLight
}

class Window {
    readonly width: number
    readonly height: number
    constructor(window: globalThis.Window) {
        this.width = window.innerWidth
        this.height = window.innerHeight
    }

    /** returns the width of a square cell */
    public getCellDims(): number {
        return this.width * CONFIG.columnsRelativeSize
    }

    /** returns the total amount of square cells that should be rendered */
    public getCellCount(): number {
        const columns = Math.floor(this.width / this.getCellDims())
        const rows = Math.floor(this.height / this.getCellDims())
        return columns * rows
    }
}


/** Builder Pattern Class For Setting up the Three Scene */
class ThreeScene {
    readonly scene: THREE.Scene
    camera: THREE.PerspectiveCamera | THREE.OrthographicCamera | null = null
    renderer: THREE.WebGLRenderer | null = null
    readonly windowSize: Window
    constructor(windowSize: Window) {
        this.windowSize = windowSize
        this.scene = new THREE.Scene()

    }

    /**
     * Sets the camera to an orthographic camera: Uses Default hardcoded values as of now
     * @returns The ThreeScene instance
     */
    public withOrthographicCamera(): ThreeScene {
        const w = this.windowSize.width;
        const h = this.windowSize.height;
        this.camera = new THREE.OrthographicCamera(-w / 2, w / 2, h / 2, -h / 2, 0.1, 1000)
        this.camera.position.z = 5
        return this
    }

    /**
     * Sets the camera to a perspective camera: Uses Default hardcoded values as of now
     * @returns The ThreeScene instance
     */
    public withPerspectiveCamera(): ThreeScene {
        this.camera = new THREE.PerspectiveCamera(75, this.windowSize.width / this.windowSize.height, 0.1, 1000)
        this.camera.position.z = 5
        return this
    }

    /**
     * Sets the renderer to a default WebGL renderer
     * @returns The ThreeScene instance
     */
    public withRenderer(useAntialiasing: boolean = false): ThreeScene {
        this.renderer = new THREE.WebGLRenderer({ antialias: useAntialiasing })
        return this
    }


    public withHelper(): ThreeScene {
        this.scene.add(new THREE.AxesHelper(15))
        return this
    }

    /**
     * Builds the ThreeScene instance
     * @returns The ThreeScene instance
     */
    public build(): ThreeScene {
        return this
    }

    /**
     * Sets the background color of the scene
     * @param color The color to set the background to set
     * @param colorFn A function that returns the color to set the background to
     */
    public setBgColor(color: string | (() => string)) {
        if (typeof color === 'function') {
            this.scene.background = new THREE.Color(color())
        } else {
            this.scene.background = new THREE.Color(color)
        }
    }

    public renderChild(child: THREE.Object3D) {
        this.scene.add(child)
    }

    /**
     * Dismounts the ThreeScene instance
     */
    public dismount() {
        this.renderer?.dispose()
        this.scene.clear()
    }
}


function feedObserver(canvas: ThreeScene) {
    canvas.setBgColor(pickSceneBackground)
}


/** Creates the Base roundedBoxGeometry to be used by Mesh or InstancedMesh */
function createCube(window: Window): {geometry: RoundedBoxGeometry, material: THREE.Material[]} {
    const cellWidth = window.getCellDims()
    return {
        geometry: new RoundedBoxGeometry(cellWidth, cellWidth, cellWidth, 4, 5),
        material: [
            new THREE.MeshBasicMaterial({ color: 0x00ff00 }),
            new THREE.MeshBasicMaterial({ color: 0x00ff00 }),
            new THREE.MeshBasicMaterial({ color: 0x000000 }),
            new THREE.MeshBasicMaterial({ color: 0x000000 }),
            new THREE.MeshBasicMaterial({ color: 0x0fc0200 }),
            new THREE.MeshBasicMaterial({ color: 0x0fc0200 })
        ]
    }
}

/** Creates an instanced mesh of cubes to fill the scene. App */
function createCubesInstancedMesh(scene: ThreeScene) {
    const cellWidth = scene.windowSize.getCellDims()
    const cellCount = scene.windowSize.getCellCount()
    const instancedMesh = new THREE.InstancedMesh(createCube(scene.windowSize).geometry, createCube(scene.windowSize).material, cellCount)

    // before rendering first use Object3D to actually set positions of each cube
    const m = new THREE.Matrix4();
    let i = 0;
    for (let x = 0; x < scene.windowSize.width; x += cellWidth) {
        for (let y = 0; y < scene.windowSize.height; y += cellWidth) {
            m.setPosition(x, y, 0)
            instancedMesh.setMatrixAt(i, m)
            i++;
        }
    }

    instancedMesh.instanceMatrix.needsUpdate = true;
    scene.renderChild(instancedMesh);
}

export default function MovingLeafBg() {
    const mountRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!mountRef.current) return
        const currentWindow = window
        const windowSize = new Window(currentWindow)

        const canvas = new ThreeScene(windowSize)
            .withOrthographicCamera()
            .withRenderer(true)
            .withHelper()
            .build()
        
        if (!canvas.camera || !canvas.renderer) {
            throw new Error('Camera or renderer not initialized')
        }

        canvas.setBgColor(pickSceneBackground)
        const observer = new MutationObserver(() => feedObserver(canvas))
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
        
        createCubesInstancedMesh(canvas)


        canvas.renderer.setSize(windowSize.width, windowSize.height)
        mountRef.current.appendChild(canvas.renderer.domElement)

        

        const animate = () => {
            requestAnimationFrame(animate)
            canvas.renderer?.render(canvas.scene, canvas.camera!)
        }
        animate()

        return () => {
            mountRef.current?.removeChild(canvas.renderer?.domElement!) // not sure how im feeling about this NN assertion
            canvas.dismount()
        }



    }, [])

    return (
        <div ref={mountRef} className="fixed inset-0 z-0" />
    )
}
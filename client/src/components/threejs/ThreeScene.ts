import * as THREE from 'three'

/**
 * Minimal builder-pattern wrapper around the core three.js trinity:
 * Scene + Camera + Renderer. Layout-agnostic — all dimensions are passed in
 * by the caller.
 */
export class ThreeScene {
    readonly scene: THREE.Scene
    camera: THREE.PerspectiveCamera | THREE.OrthographicCamera | null = null
    renderer: THREE.WebGLRenderer | null = null

    constructor() {
        this.scene = new THREE.Scene()
    }

    public withOrthographicCamera(
        width: number,
        height: number,
        near: number = 0.1,
        far: number = 1000,
    ): this {
        this.camera = new THREE.OrthographicCamera(-width / 2, width / 2, height / 2, -height / 2, near, far)
        this.camera.position.z = 5
        return this
    }

    public withPerspectiveCamera(
        width: number,
        height: number,
        fov: number = 75,
        near: number = 0.1,
        far: number = 1000,
    ): this {
        this.camera = new THREE.PerspectiveCamera(fov, width / height, near, far)
        this.camera.position.z = 5
        return this
    }

    public withRenderer(width: number, height: number, useAntialiasing: boolean = false): this {
        this.renderer = new THREE.WebGLRenderer({ antialias: useAntialiasing })
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
        this.renderer.setSize(width, height)
        return this
    }

    public withAxesHelper(size: number = 15): this {
        this.scene.add(new THREE.AxesHelper(size))
        return this
    }

    public build(): this {
        return this
    }

    public setBgColor(color: string | (() => string)) {
        const value = typeof color === 'function' ? color() : color
        this.scene.background = new THREE.Color(value)
    }

    public addToScene(child: THREE.Object3D) {
        this.scene.add(child)
    }

    /** Apply rotation to the camera using degrees */
    public applyCameraRotation(x: number | undefined, y: number | undefined, z: number | undefined) {
        if (!this.camera) return
        if (x !== undefined) this.camera.rotation.x = x * Math.PI / 180
        if (y !== undefined) this.camera.rotation.y = y * Math.PI / 180
        if (z !== undefined) this.camera.rotation.z = z * Math.PI / 180
    }

    public applyCameraPosition(x: number | undefined, y: number | undefined, z: number | undefined) {
        if (!this.camera) return
        if (x !== undefined) this.camera.position.x = x
        if (y !== undefined) this.camera.position.y = y
        if (z !== undefined) this.camera.position.z = z
    }

    /** Update an orthographic camera's frustum to match new viewport dims (call on resize).
     *  No-op for perspective cameras or before a camera is set. Preserves position/rotation/near/far. */
    public setOrthographicFrustum(width: number, height: number) {
        if (!this.camera || !(this.camera instanceof THREE.OrthographicCamera)) return
        this.camera.left = -width / 2
        this.camera.right = width / 2
        this.camera.top = height / 2
        this.camera.bottom = -height / 2
        this.camera.updateProjectionMatrix()
    }

    public dismount() {
        this.renderer?.dispose()
        this.scene.clear()
    }
}

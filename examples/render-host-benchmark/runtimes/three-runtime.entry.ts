import * as THREE from 'three'

interface BenchmarkRuntimeContext {
  renderMode: 'dom'
  width: number
  height: number
  dom: { root: HTMLElement; overlay: HTMLElement }
  content: {
    get(key: string): string
    all(): Readonly<Record<string, string>>
  }
  capture: { waitUntil(promise: Promise<unknown>): void }
  emit(eventName: string, payload?: unknown): void
}

interface BenchmarkLifecycle {
  resize(width: number, height: number): void
  setVisible(visible: boolean): void
  suspend(): void
  resume(): void
  prepareCapture(): void
  destroy(): void
}

declare global {
  // The host owns this registration point. Three.js is bundled into this file.
  var CoursewareRuntime: {
    define(definition: {
      runtimeApiVersion: 2
      create(context: BenchmarkRuntimeContext): BenchmarkLifecycle
    }): void
  }
}

function disposeMaterial(material: THREE.Material): void {
  for (const value of Object.values(material)) {
    if (value instanceof THREE.Texture) value.dispose()
  }
  material.dispose()
}

globalThis.CoursewareRuntime.define({
  runtimeApiVersion: 2,

  create(ctx) {
    if (ctx.renderMode !== 'dom') {
      throw new Error('Three.js benchmark requires renderMode=dom')
    }

    const content = ctx.content.all()
    const state = {
      yaw: 0.35,
      pitch: -0.18,
      distance: 7.2,
      phase: 0,
      dragging: false,
      pointerId: -1,
      previousX: 0,
      previousY: 0,
      running: true,
      visible: true,
      destroyed: false,
    }

    const host = document.createElement('section')
    host.setAttribute('aria-label', content.ariaLabel ?? '')
    Object.assign(host.style, {
      position: 'absolute',
      left: '62px',
      top: '122px',
      width: '1156px',
      height: '432px',
      border: '2px solid rgba(129, 140, 248, .72)',
      borderRadius: '30px',
      overflow: 'hidden',
      background: 'linear-gradient(145deg, rgba(15,23,42,.98), rgba(30,27,75,.96))',
      boxSizing: 'border-box',
      pointerEvents: 'auto',
    })

    const title = document.createElement('h2')
    title.textContent = content.panelTitle ?? ''
    Object.assign(title.style, {
      position: 'absolute',
      zIndex: '2',
      left: '24px',
      top: '20px',
      margin: '0',
      color: '#e0e7ff',
      font: '700 24px/1.25 Microsoft YaHei, sans-serif',
      pointerEvents: 'none',
    })

    const hint = document.createElement('p')
    hint.textContent = content.instruction ?? ''
    Object.assign(hint.style, {
      position: 'absolute',
      zIndex: '2',
      left: '24px',
      top: '54px',
      width: '360px',
      margin: '0',
      color: '#c7d2fe',
      font: '15px/1.6 Microsoft YaHei, sans-serif',
      pointerEvents: 'none',
    })

    const status = document.createElement('output')
    status.textContent = content.readyStatus ?? ''
    Object.assign(status.style, {
      position: 'absolute',
      zIndex: '2',
      left: '24px',
      bottom: '22px',
      maxWidth: '430px',
      padding: '10px 14px',
      border: '1px solid rgba(165,180,252,.45)',
      borderRadius: '12px',
      color: '#f5f3ff',
      background: 'rgba(15,23,42,.72)',
      font: '700 14px/1.35 Microsoft YaHei, sans-serif',
      pointerEvents: 'none',
    })

    const reset = document.createElement('button')
    reset.type = 'button'
    reset.textContent = content.resetLabel ?? ''
    Object.assign(reset.style, {
      position: 'absolute',
      zIndex: '3',
      left: '24px',
      bottom: '78px',
      padding: '9px 16px',
      border: '1px solid #818cf8',
      borderRadius: '999px',
      color: '#eef2ff',
      background: '#3730a3',
      font: '700 14px Microsoft YaHei, sans-serif',
      cursor: 'pointer',
    })

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.1
    Object.assign(renderer.domElement.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      display: 'block',
      cursor: 'grab',
      touchAction: 'none',
    })
    renderer.domElement.setAttribute('aria-label', content.canvasLabel ?? '')

    host.append(renderer.domElement, title, hint, reset, status)
    ctx.dom.overlay.append(host)

    const scene = new THREE.Scene()
    scene.fog = new THREE.FogExp2(0x0f172a, 0.055)
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100)
    const world = new THREE.Group()
    const earthSystem = new THREE.Group()
    world.add(earthSystem)
    scene.add(world)

    const ambient = new THREE.HemisphereLight(0xc7d2fe, 0x172554, 1.25)
    const sunLight = new THREE.DirectionalLight(0xfff7d6, 4.5)
    sunLight.position.set(-4, 3, 6)
    scene.add(ambient, sunLight)

    const earthGeometry = new THREE.SphereGeometry(1.22, 64, 40)
    const earthMaterial = new THREE.MeshStandardMaterial({
      color: 0x2563eb,
      roughness: 0.64,
      metalness: 0.05,
      emissive: 0x082f49,
      emissiveIntensity: 0.35,
    })
    const earth = new THREE.Mesh(earthGeometry, earthMaterial)
    earthSystem.add(earth)

    const gridGeometry = new THREE.SphereGeometry(1.235, 32, 20)
    const gridMaterial = new THREE.MeshBasicMaterial({
      color: 0x93c5fd,
      wireframe: true,
      transparent: true,
      opacity: 0.2,
    })
    const grid = new THREE.Mesh(gridGeometry, gridMaterial)
    earthSystem.add(grid)

    const cloudGeometry = new THREE.SphereGeometry(1.27, 48, 32)
    const cloudMaterial = new THREE.MeshStandardMaterial({
      color: 0xe0f2fe,
      transparent: true,
      opacity: 0.12,
      roughness: 0.9,
      depthWrite: false,
    })
    const clouds = new THREE.Mesh(cloudGeometry, cloudMaterial)
    earthSystem.add(clouds)

    const orbitGeometry = new THREE.TorusGeometry(2.25, 0.012, 8, 160)
    const orbitMaterial = new THREE.MeshBasicMaterial({
      color: 0xa5b4fc,
      transparent: true,
      opacity: 0.48,
    })
    const moonOrbit = new THREE.Mesh(orbitGeometry, orbitMaterial)
    moonOrbit.rotation.x = Math.PI / 2.6
    earthSystem.add(moonOrbit)

    const moonGeometry = new THREE.SphereGeometry(0.27, 32, 20)
    const moonMaterial = new THREE.MeshStandardMaterial({
      color: 0xdbeafe,
      roughness: 0.95,
    })
    const moon = new THREE.Mesh(moonGeometry, moonMaterial)
    earthSystem.add(moon)

    const starCount = 360
    const starPositions = new Float32Array(starCount * 3)
    for (let index = 0; index < starCount; index += 1) {
      const radius = 10 + (index % 17) * 0.36
      const longitude = index * 2.399963229728653
      const latitude = Math.acos(1 - 2 * ((index + 0.5) / starCount))
      starPositions[index * 3] = Math.sin(latitude) * Math.cos(longitude) * radius
      starPositions[index * 3 + 1] = Math.cos(latitude) * radius
      starPositions[index * 3 + 2] = Math.sin(latitude) * Math.sin(longitude) * radius
    }
    const starGeometry = new THREE.BufferGeometry()
    starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3))
    const starMaterial = new THREE.PointsMaterial({
      color: 0xc7d2fe,
      size: 0.055,
      transparent: true,
      opacity: 0.78,
      sizeAttenuation: true,
    })
    const stars = new THREE.Points(starGeometry, starMaterial)
    scene.add(stars)

    function applyState(): void {
      world.rotation.set(state.pitch, state.yaw, 0)
      camera.position.set(0.55, 0.2, state.distance)
      camera.lookAt(0, 0, 0)
      const moonAngle = state.phase * 0.55 + 0.8
      moon.position.set(
        Math.cos(moonAngle) * 2.25,
        Math.sin(moonAngle * 0.7) * 0.48,
        Math.sin(moonAngle) * 2.25,
      )
      earth.rotation.y = state.phase * 0.28
      clouds.rotation.y = state.phase * 0.34 + 0.35
    }

    function renderFrame(): void {
      applyState()
      renderer.render(scene, camera)
    }

    function resizeRenderer(width: number, height: number): void {
      const stageWidth = Math.max(320, Math.min(1156, width - 124))
      const stageHeight = Math.max(220, Math.min(432, height - 288))
      host.style.width = `${stageWidth}px`
      host.style.height = `${stageHeight}px`
      renderer.setSize(stageWidth, stageHeight, false)
      camera.aspect = stageWidth / stageHeight
      camera.updateProjectionMatrix()
      renderFrame()
    }

    let animationFrame = 0
    let previousFrame = performance.now()
    function tick(now: number): void {
      animationFrame = 0
      if (!state.running || !state.visible || state.destroyed) return
      const deltaSeconds = Math.min(0.05, Math.max(0, (now - previousFrame) / 1000))
      previousFrame = now
      state.phase += deltaSeconds
      renderFrame()
      animationFrame = window.requestAnimationFrame(tick)
    }

    function startLoop(): void {
      if (state.destroyed || !state.running || !state.visible || animationFrame !== 0) return
      previousFrame = performance.now()
      animationFrame = window.requestAnimationFrame(tick)
    }

    function stopLoop(): void {
      if (animationFrame !== 0) window.cancelAnimationFrame(animationFrame)
      animationFrame = 0
    }

    function onPointerDown(event: PointerEvent): void {
      if (!state.running || !state.visible) return
      state.dragging = true
      state.pointerId = event.pointerId
      state.previousX = event.clientX
      state.previousY = event.clientY
      renderer.domElement.setPointerCapture(event.pointerId)
      renderer.domElement.style.cursor = 'grabbing'
      status.textContent = content.draggingStatus ?? ''
    }

    function onPointerMove(event: PointerEvent): void {
      if (!state.dragging || event.pointerId !== state.pointerId) return
      state.yaw += (event.clientX - state.previousX) * 0.008
      state.pitch = THREE.MathUtils.clamp(
        state.pitch + (event.clientY - state.previousY) * 0.006,
        -1.1,
        1.1,
      )
      state.previousX = event.clientX
      state.previousY = event.clientY
      renderFrame()
    }

    function finishDrag(event: PointerEvent): void {
      if (!state.dragging || event.pointerId !== state.pointerId) return
      state.dragging = false
      state.pointerId = -1
      renderer.domElement.style.cursor = 'grab'
      status.textContent = content.rotatedStatus ?? ''
      ctx.emit('three:rotated', { yaw: state.yaw, pitch: state.pitch })
    }

    function onWheel(event: WheelEvent): void {
      if (!state.running || !state.visible) return
      event.preventDefault()
      state.distance = THREE.MathUtils.clamp(state.distance + event.deltaY * 0.006, 4.2, 11)
      status.textContent = content.zoomedStatus ?? ''
      renderFrame()
    }

    function onReset(): void {
      state.yaw = 0.35
      state.pitch = -0.18
      state.distance = 7.2
      state.phase = 0.6
      status.textContent = content.resetStatus ?? ''
      renderFrame()
      ctx.emit('three:reset')
    }

    function onContextLost(event: Event): void {
      event.preventDefault()
      status.textContent = content.contextLostStatus ?? ''
    }

    function onContextRestored(): void {
      status.textContent = content.contextRestoredStatus ?? ''
      renderFrame()
    }

    renderer.domElement.addEventListener('pointerdown', onPointerDown)
    renderer.domElement.addEventListener('pointermove', onPointerMove)
    renderer.domElement.addEventListener('pointerup', finishDrag)
    renderer.domElement.addEventListener('pointercancel', finishDrag)
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false })
    renderer.domElement.addEventListener('webglcontextlost', onContextLost)
    renderer.domElement.addEventListener('webglcontextrestored', onContextRestored)
    reset.addEventListener('click', onReset)

    resizeRenderer(ctx.width, ctx.height)
    startLoop()
    ctx.capture.waitUntil(document.fonts?.ready ?? Promise.resolve())

    return {
      resize(width, height) {
        resizeRenderer(width, height)
      },
      setVisible(visible) {
        state.visible = visible
        host.hidden = !visible
        host.style.pointerEvents = visible ? 'auto' : 'none'
        if (visible && state.running) startLoop()
        else stopLoop()
      },
      suspend() {
        state.running = false
        stopLoop()
        status.textContent = content.suspendedStatus ?? ''
      },
      resume() {
        if (state.destroyed) return
        state.running = true
        status.textContent = content.readyStatus ?? ''
        if (state.visible) startLoop()
      },
      prepareCapture() {
        state.phase = 1.35
        applyState()
        renderer.render(scene, camera)
      },
      destroy() {
        if (state.destroyed) return
        state.destroyed = true
        state.running = false
        stopLoop()
        renderer.domElement.removeEventListener('pointerdown', onPointerDown)
        renderer.domElement.removeEventListener('pointermove', onPointerMove)
        renderer.domElement.removeEventListener('pointerup', finishDrag)
        renderer.domElement.removeEventListener('pointercancel', finishDrag)
        renderer.domElement.removeEventListener('wheel', onWheel)
        renderer.domElement.removeEventListener('webglcontextlost', onContextLost)
        renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored)
        reset.removeEventListener('click', onReset)

        scene.traverse((object) => {
          if (!(object instanceof THREE.Mesh) && !(object instanceof THREE.Points)) return
          object.geometry.dispose()
          const materials = Array.isArray(object.material) ? object.material : [object.material]
          for (const material of materials) disposeMaterial(material)
        })
        renderer.renderLists.dispose()
        renderer.dispose()
        renderer.forceContextLoss()
        host.remove()
      },
    }
  },
})

export {}

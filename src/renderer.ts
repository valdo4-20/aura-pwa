import * as THREE from 'three';
import { generateGeometry, type ShapeName } from './geometry';
import type { VisualState } from './visual-state';

const GLYPHS = ['.', ':', ';', '+', '*', '=', '%', '#', '@', 'o', 'x', '0', '1', '/', '\\', '|'];

interface Particle {
  id: number;
  glyph: number;
  phase: number;
  scale: number;
}

export class AsciiRenderer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly root = new THREE.Group();
  private readonly glyphMeshes: THREE.InstancedMesh[] = [];
  private readonly particles: Particle[] = [];
  private positions: Float32Array;
  private targets: Float32Array;
  private readonly rotationTarget = new THREE.Euler();
  private animationFrame = 0;
  private lastFrame = 0;
  private elapsed = 0;
  private state: VisualState = 'idle';
  private currentShape: ShapeName = 'sphere';
  private density: number;
  private paused = false;
  private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private disposed = false;
  private zoom = 1;
  private pointerActive = false;
  private pointerId: number | null = null;
  private lastPointer = new THREE.Vector2();
  private pinchDistance = 0;
  private readonly rootWorldQuaternion = new THREE.Quaternion();
  private readonly localBillboardQuaternion = new THREE.Quaternion();

  constructor(private readonly canvas: HTMLCanvasElement, density = 1200) {
    this.density = density;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x08090b, 1);
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    this.camera.position.set(0, 0, 6);
    this.positions = generateGeometry('sphere', density);
    this.targets = this.positions.slice();
    this.buildParticles();
    this.root.scale.setScalar(1.55);
    this.root.add(...this.glyphMeshes);
    this.scene.add(this.root);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement ?? canvas);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    canvas.addEventListener('webglcontextlost', this.onContextLost);
    this.resize();
    this.animate(0);
  }

  private readonly scene = new THREE.Scene();
  private readonly resizeObserver: ResizeObserver;
  private readonly onVisibilityChange = (): void => {
    if (!document.hidden && !this.paused) this.animate(0);
  };
  private readonly onContextLost = (event: Event): void => {
    event.preventDefault();
    this.dispatchEvent(new CustomEvent('renderer-error', { detail: 'O contexto gráfico foi interrompido. Tentando restaurar a visualização…' }));
  };

  setState(state: VisualState): void {
    this.state = state;
  }

  setZoom(value: number): void {
    this.zoom = Math.min(2.8, Math.max(0.65, value));
  }

  zoomBy(delta: number): void {
    this.setZoom(this.zoom * (1 + delta));
  }

  setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
  }

  setDensity(density: number): void {
    const next = Math.max(400, Math.min(2400, Math.round(density / 100) * 100));
    if (next === this.density) return;
    this.density = next;
    this.disposeMeshes();
    this.positions = generateGeometry(this.currentShape, next);
    this.targets = this.positions.slice();
    this.buildParticles();
    this.root.clear();
    this.root.add(...this.glyphMeshes);
    this.dispatchEvent(new CustomEvent('density-change', { detail: next }));
  }

  morphTo(shape: ShapeName): void {
    this.currentShape = shape;
    this.targets = generateGeometry(shape, this.density);
  }

  rotateBy(axis: 'x' | 'y' | 'z', radians: number): void {
    this.rotationTarget[axis] += radians;
  }

  pause(paused: boolean): void {
    this.paused = paused;
    if (!paused) this.animate(0);
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.animationFrame);
    this.resizeObserver.disconnect();
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.disposeMeshes();
    this.renderer.dispose();
  }

  private buildParticles(): void {
    this.particles.length = 0;
    const groups: number[][] = Array.from({ length: GLYPHS.length }, () => []);
    for (let index = 0; index < this.density; index += 1) {
      const glyph = index % GLYPHS.length;
      this.particles.push({ id: index, glyph, phase: (index * 0.61803398875) % (Math.PI * 2), scale: 0.034 + ((index * 17) % 7) * 0.002 });
      groups[glyph].push(index);
    }
    this.glyphMeshes.length = 0;
    for (let glyphIndex = 0; glyphIndex < groups.length; glyphIndex += 1) {
      const indexes = groups[glyphIndex];
      if (indexes.length === 0) continue;
      const texture = this.createGlyphTexture(GLYPHS[glyphIndex]);
      const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, side: THREE.DoubleSide, color: 0xf2f1e9 });
      const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), material, indexes.length);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.userData.particleIndexes = indexes;
      this.glyphMeshes.push(mesh);
    }
  }

  private createGlyphTexture(glyph: string): THREE.CanvasTexture {
    const surface = document.createElement('canvas');
    surface.width = 64;
    surface.height = 64;
    const context = surface.getContext('2d');
    if (!context) throw new Error('Não foi possível criar o atlas tipográfico ASCII.');
    context.clearRect(0, 0, 64, 64);
    context.fillStyle = '#fff';
    context.font = '56px monospace';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(glyph, 32, 34);
    const texture = new THREE.CanvasTexture(surface);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  private animate = (timestamp: number): void => {
    if (this.disposed || this.paused || document.hidden) return;
    this.animationFrame = requestAnimationFrame(this.animate);
    const delta = Math.min((timestamp - (this.lastFrame || timestamp)) / 1000, 0.05);
    this.lastFrame = timestamp;
    this.elapsed += delta;
    this.updateParticles();

    const responseBoost = this.state === 'responding' ? 0.22 : this.state === 'processing' ? 0.18 : this.state === 'listening' ? 0.1 : 0.045;
    this.root.rotation.y += delta * (this.reducedMotion ? 0.035 : responseBoost);
    this.root.rotation.x += (this.rotationTarget.x + Math.sin(this.elapsed * 0.18) * (this.reducedMotion ? 0.025 : 0.08) - this.root.rotation.x) * 0.04;
    this.root.rotation.y += (this.rotationTarget.y - this.root.rotation.y) * 0.04;
    this.root.rotation.z += (this.rotationTarget.z - this.root.rotation.z) * 0.04;

    const pulse = this.reducedMotion ? 0 : Math.sin(this.elapsed * (this.state === 'responding' ? 2.6 : 1.2)) * (this.state === 'idle' ? 0.018 : this.state === 'responding' ? 0.08 : 0.035);
    this.root.scale.setScalar(1.55 + pulse + (this.state === 'listening' ? 0.07 : this.state === 'responding' ? 0.12 : 0));
    this.camera.position.z += (6 / this.zoom - this.camera.position.z) * 0.08;
    this.renderer.render(this.scene, this.camera);
  };

  private updateParticles(): void {
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const matrix = new THREE.Matrix4();
    this.root.updateWorldMatrix(true, false);
    this.root.getWorldQuaternion(this.rootWorldQuaternion);
    this.localBillboardQuaternion.copy(this.rootWorldQuaternion).invert().multiply(this.camera.quaternion);
    const amount = this.reducedMotion ? 0.018 : this.state === 'responding' ? 0.085 : this.state === 'processing' ? 0.065 : 0.035;
    for (const mesh of this.glyphMeshes) {
      const indexes = mesh.userData.particleIndexes as number[];
      for (let slot = 0; slot < indexes.length; slot += 1) {
        const index = indexes[slot];
        const offset = index * 3;
        const phase = this.particles[index].phase;
        const wave = Math.sin(this.elapsed * 0.8 + phase) * amount;
        const targetX = this.targets[offset];
        const targetY = this.targets[offset + 1];
        const targetZ = this.targets[offset + 2];
        this.positions[offset] += (targetX - this.positions[offset]) * 0.055;
        this.positions[offset + 1] += (targetY - this.positions[offset + 1]) * 0.055;
        this.positions[offset + 2] += (targetZ - this.positions[offset + 2]) * 0.055;
        position.set(this.positions[offset] * (1 + wave), this.positions[offset + 1] * (1 + wave), this.positions[offset + 2] * (1 + wave));
        scale.setScalar(this.particles[index].scale * (this.state === 'processing' ? 1.1 : 1));
        matrix.compose(position, this.localBillboardQuaternion, scale);
        mesh.setMatrixAt(slot, matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  private resize(): void {
    const bounds = (this.canvas.parentElement ?? this.canvas).getBoundingClientRect();
    const width = Math.max(1, Math.floor(bounds.width));
    const height = Math.max(1, Math.floor(bounds.height));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  handlePointerDown(event: PointerEvent): void {
    this.pointerActive = true;
    this.pointerId = event.pointerId;
    this.lastPointer.set(event.clientX, event.clientY);
    this.canvas.setPointerCapture?.(event.pointerId);
  }

  handlePointerMove(event: PointerEvent): void {
    if (!this.pointerActive || this.pointerId !== event.pointerId) return;
    const dx = event.clientX - this.lastPointer.x;
    const dy = event.clientY - this.lastPointer.y;
    this.rotationTarget.y += dx * 0.003;
    this.rotationTarget.x += dy * 0.003;
    this.lastPointer.set(event.clientX, event.clientY);
  }

  handlePointerUp(event: PointerEvent): void {
    if (this.pointerId === event.pointerId) {
      this.pointerActive = false;
      this.pointerId = null;
    }
  }

  handleWheel(event: WheelEvent): void {
    event.preventDefault();
    this.zoomBy(-event.deltaY * 0.0007);
  }

  handleTouchZoom(distance: number): void {
    if (distance <= 0) return;
    const nextZoom = Math.min(2.6, Math.max(0.7, this.zoom * (distance / Math.max(this.pinchDistance || distance, 1))));
    this.zoom = nextZoom;
    this.pinchDistance = distance;
  }

  beginTouchZoom(distance: number): void {
    this.pinchDistance = distance;
  }

  endTouchZoom(): void {
    this.pinchDistance = 0;
  }

  private disposeMeshes(): void {
    for (const mesh of this.glyphMeshes) {
      mesh.geometry.dispose();
      const material = mesh.material as THREE.MeshBasicMaterial;
      material.map?.dispose();
      material.dispose();
    }
    this.glyphMeshes.length = 0;
  }

  private dispatchEvent(event: Event): void {
    this.canvas.dispatchEvent(event);
  }
}

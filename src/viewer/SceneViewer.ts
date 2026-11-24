import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

export interface SceneStats {
  meshes: number;
  vertices: number;
  triangles: number;
}

/**
 * 极简 Three.js 场景查看器：环境光 + 方向光 + 网格地面 + GLB 加载。
 * 只负责渲染与取景，不感知业务状态。
 */
export class SceneViewer {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private loader = new GLTFLoader();
  private root: THREE.Object3D | null = null;
  private observer: ResizeObserver;
  private raf = 0;
  private disposed = false;
  private wireframe = false;
  private hasFramed = false;

  onStats?: (stats: SceneStats) => void;
  onLoading?: (loading: boolean) => void;
  onError?: (message: string) => void;

  constructor(container: HTMLElement) {
    this.container = container;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth || 1, container.clientHeight || 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.style.outline = "none";
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b0b0e);

    this.camera = new THREE.PerspectiveCamera(
      45,
      (container.clientWidth || 1) / (container.clientHeight || 1),
      0.05,
      2000
    );
    this.camera.position.set(6, 5.5, 8);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.target.set(0, 1, 0);
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.controls.minDistance = 0.2;
    this.controls.maxDistance = 400;

    // 环境反射（轻微）
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
    this.scene.environment = envRT.texture;
    this.scene.environmentIntensity = 0.55;
    pmrem.dispose();

    const hemi = new THREE.HemisphereLight(0xffffff, 0x1a1a22, 1.0);
    this.scene.add(hemi);

    const key = new THREE.DirectionalLight(0xffffff, 2.6);
    key.position.set(6, 10, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 80;
    key.shadow.camera.left = -15;
    key.shadow.camera.right = 15;
    key.shadow.camera.top = 15;
    key.shadow.camera.bottom = -15;
    key.shadow.bias = -0.0005;
    this.scene.add(key);

    const rim = new THREE.DirectionalLight(0x9db4ff, 0.5);
    rim.position.set(-8, 4, -6);
    this.scene.add(rim);

    const grid = new THREE.GridHelper(40, 40, 0x2c2c33, 0x17171c);
    const gridMat = grid.material as THREE.LineBasicMaterial;
    gridMat.transparent = true;
    gridMat.opacity = 0.65;
    grid.position.y = 0;
    this.scene.add(grid);

    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);

    const animate = () => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(animate);
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    animate();
  }

  private resize(): void {
    const width = this.container.clientWidth || 1;
    const height = this.container.clientHeight || 1;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  /** 加载 GLB（Blender 同步导出的场景），替换旧模型 */
  async load(url: string): Promise<void> {
    this.onLoading?.(true);
    try {
      const gltf = await this.loader.loadAsync(url);
      if (this.disposed) return;
      if (this.root) {
        this.scene.remove(this.root);
        disposeObject(this.root);
      }
      this.root = gltf.scene;
      this.root.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          obj.castShadow = true;
          obj.receiveShadow = true;
        }
      });
      this.applyWireframe();
      this.scene.add(this.root);
      this.onStats?.(computeStats(this.root));

      if (!this.hasFramed) {
        this.frameAll();
        this.hasFramed = true;
      }
    } catch (err) {
      this.onError?.((err as Error).message || "模型加载失败");
    } finally {
      if (!this.disposed) this.onLoading?.(false);
    }
  }

  frameAll(): void {
    if (!this.root) return;
    const box = new THREE.Box3().setFromObject(this.root);
    if (box.isEmpty()) return;

    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const radius = Math.max(size.length() / 2, 0.5);

    const fov = (this.camera.fov * Math.PI) / 180;
    const distance = (radius / Math.sin(fov / 2)) * 1.35;
    const dir = new THREE.Vector3(1, 0.72, 1).normalize();

    this.controls.target.copy(center);
    this.camera.position.copy(center).addScaledVector(dir, distance);
    this.camera.near = Math.max(distance / 1000, 0.01);
    this.camera.far = Math.max(distance * 100, 100);
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  setWireframe(on: boolean): void {
    this.wireframe = on;
    this.applyWireframe();
  }

  private applyWireframe(): void {
    this.root?.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of materials) {
        if (mat && "wireframe" in mat) {
          (mat as THREE.MeshStandardMaterial).wireframe = this.wireframe;
        }
      }
    });
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.observer.disconnect();
    this.controls.dispose();
    if (this.root) disposeObject(this.root);
    this.scene.environment?.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

function computeStats(root: THREE.Object3D): SceneStats {
  let meshes = 0;
  let vertices = 0;
  let triangles = 0;
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    meshes += 1;
    const geo = mesh.geometry as THREE.BufferGeometry;
    const pos = geo.getAttribute("position");
    if (pos) vertices += pos.count;
    if (geo.index) triangles += geo.index.count / 3;
    else if (pos) triangles += pos.count / 3;
  });
  return { meshes, vertices, triangles: Math.round(triangles) };
}

function disposeObject(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of materials) mat?.dispose();
  });
}

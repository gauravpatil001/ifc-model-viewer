import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { IFCLoader } from "web-ifc-three/IFCLoader";

const viewerRoot = document.getElementById("viewer");
const statusEl = document.getElementById("status");
const fileInput = document.getElementById("file-input");

let loadIfc = null;
let runtimeReady = false;

fileInput.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!runtimeReady || !loadIfc) {
    statusEl.textContent = "Viewer initialization failed. Check network access and refresh.";
    return;
  }
  await loadIfc(file);
});

async function initViewer() {
  try {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf4f7fa);

    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 5000);
    camera.position.set(12, 10, 12);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    viewerRoot.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 1.5, 0);

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const dir = new THREE.DirectionalLight(0xffffff, 0.9);
    dir.position.set(20, 25, 10);
    scene.add(dir);

    const grid = new THREE.GridHelper(60, 60, 0xb8c4d0, 0xd8e1e8);
    scene.add(grid);
    scene.add(new THREE.AxesHelper(2.5));

    const ifcLoader = new IFCLoader();
    ifcLoader.ifcManager.setWasmPath("/wasm/");
    let currentModel = null;

    function resizeRenderer() {
      const width = viewerRoot.clientWidth;
      const height = viewerRoot.clientHeight;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }

    function fitCameraToObject(object3d) {
      const box = new THREE.Box3().setFromObject(object3d);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());

      const maxDim = Math.max(size.x, size.y, size.z);
      const fov = (camera.fov * Math.PI) / 180;
      const cameraDistance = maxDim / (2 * Math.tan(fov / 2));

      camera.near = Math.max(0.1, cameraDistance / 1000);
      camera.far = cameraDistance * 1000;
      camera.position.set(
        center.x + cameraDistance * 1.2,
        center.y + cameraDistance * 0.9,
        center.z + cameraDistance * 1.2,
      );
      camera.updateProjectionMatrix();
      controls.target.copy(center);
      controls.update();
    }

    loadIfc = async (file) => {
      const url = URL.createObjectURL(file);
      statusEl.textContent = `Loading ${file.name}...`;
      try {
        if (currentModel) {
          scene.remove(currentModel);
          currentModel.geometry?.dispose?.();
        }
        const model = await ifcLoader.loadAsync(url);
        currentModel = model;
        scene.add(model);
        fitCameraToObject(model);
        statusEl.textContent = `Loaded ${file.name}`;
      } catch (error) {
        console.error(error);
        statusEl.textContent = "Failed to load IFC file. See browser console.";
      } finally {
        URL.revokeObjectURL(url);
      }
    };

    window.addEventListener("resize", resizeRenderer);
    resizeRenderer();

    function animate() {
      controls.update();
      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    }
    animate();

    runtimeReady = true;
    statusEl.textContent = "Viewer ready. Load an IFC file to begin.";
  } catch (error) {
    console.error(error);
    runtimeReady = false;
    statusEl.textContent = "Failed to initialize viewer.";
  }
}

initViewer();

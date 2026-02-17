import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { IFCLoader } from "web-ifc-three/IFCLoader";
import { IFCDOOR, IFCPRODUCT, IFCSLAB, IFCWALL, IFCWALLSTANDARDCASE } from "web-ifc";

const viewerRoot = document.getElementById("viewer");
const statusEl = document.getElementById("status");
const fileInput = document.getElementById("file-input");
const metaEmptyEl = document.getElementById("meta-empty");
const metaContentEl = document.getElementById("meta-content");
const filterWallsEl = document.getElementById("filter-walls");
const filterSlabsEl = document.getElementById("filter-slabs");
const filterDoorsEl = document.getElementById("filter-doors");
const sectionAxisEl = document.getElementById("section-axis");
const sectionOffsetEl = document.getElementById("section-offset");
const sectionValueEl = document.getElementById("section-value");
const sectionApplyEl = document.getElementById("section-apply");
const sectionClearEl = document.getElementById("section-clear");

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
    renderer.localClippingEnabled = true;
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
    let activePickTarget = null;
    let pointerDown = null;
    let modelBounds = null;
    let sectionActive = false;
    let allProductIds = new Set();
    const groupedTypeIds = {
      walls: new Set(),
      slabs: new Set(),
      doors: new Set(),
    };

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    function setEmptyMetadata(message) {
      metaEmptyEl.textContent = message;
      metaEmptyEl.style.display = "block";
      metaContentEl.innerHTML = "";
    }

    function setMetadata(modelID, expressID, properties) {
      metaEmptyEl.style.display = "none";
      metaContentEl.innerHTML = "";

      const modelLine = document.createElement("p");
      modelLine.className = "meta-block";
      modelLine.innerHTML = `<strong>Model ID:</strong> <code>${modelID}</code>`;

      const expressLine = document.createElement("p");
      expressLine.className = "meta-block";
      expressLine.innerHTML = `<strong>Express ID:</strong> <code>${expressID}</code>`;

      const pre = document.createElement("pre");
      pre.className = "meta-json";
      pre.textContent = JSON.stringify(properties, null, 2);

      metaContentEl.append(modelLine, expressLine, pre);
    }

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

    function buildSectionPlane(axis, offsetPercent) {
      if (!modelBounds) return null;

      const center = modelBounds.getCenter(new THREE.Vector3());
      const point = center.clone();
      const t = (offsetPercent + 100) / 200;
      let normal = new THREE.Vector3(0, -1, 0);

      if (axis === "x") {
        point.x = THREE.MathUtils.lerp(modelBounds.min.x, modelBounds.max.x, t);
        normal = new THREE.Vector3(-1, 0, 0);
      } else if (axis === "y") {
        point.y = THREE.MathUtils.lerp(modelBounds.min.y, modelBounds.max.y, t);
        normal = new THREE.Vector3(0, -1, 0);
      } else if (axis === "z") {
        point.z = THREE.MathUtils.lerp(modelBounds.min.z, modelBounds.max.z, t);
        normal = new THREE.Vector3(0, 0, -1);
      }

      return new THREE.Plane().setFromNormalAndCoplanarPoint(normal, point);
    }

    function applySectionView() {
      if (!currentModel || !modelBounds) {
        statusEl.textContent = "Load a model before applying section view.";
        return;
      }

      const axis = sectionAxisEl.value;
      const offset = Number(sectionOffsetEl.value);
      const plane = buildSectionPlane(axis, offset);
      renderer.clippingPlanes = plane ? [plane] : [];
      sectionActive = true;
      statusEl.textContent = `Section view active (${axis.toUpperCase()} @ ${offset}%).`;
    }

    function clearSectionView() {
      renderer.clippingPlanes = [];
      sectionActive = false;
      if (currentModel) statusEl.textContent = "Section view cleared.";
    }

    async function collectTypeIds(modelID, typeCodes) {
      const out = new Set();
      for (const code of typeCodes) {
        const ids = await ifcLoader.ifcManager.getAllItemsOfType(modelID, code, false);
        for (const id of ids) out.add(id);
      }
      return out;
    }

    async function updateVisibilityFilters() {
      if (!currentModel) return;
      const modelID = currentModel.modelID;

      const hiddenIds = new Set();
      if (!filterWallsEl.checked) {
        for (const id of groupedTypeIds.walls) hiddenIds.add(id);
      }
      if (!filterSlabsEl.checked) {
        for (const id of groupedTypeIds.slabs) hiddenIds.add(id);
      }
      if (!filterDoorsEl.checked) {
        for (const id of groupedTypeIds.doors) hiddenIds.add(id);
      }

      const visibleIds = [];
      for (const id of allProductIds) {
        if (!hiddenIds.has(id)) visibleIds.push(id);
      }

      ifcLoader.ifcManager.createSubset({
        modelID,
        ids: visibleIds,
        scene,
        removePrevious: true,
        customID: "visibility-filter",
      });

      activePickTarget = ifcLoader.ifcManager.getSubset(modelID, undefined, "visibility-filter");
      currentModel.visible = false;
      renderer.render(scene, camera);
    }

    loadIfc = async (file) => {
      const url = URL.createObjectURL(file);
      statusEl.textContent = `Loading ${file.name}...`;
      try {
        if (currentModel) {
          ifcLoader.ifcManager.removeSubset(currentModel.modelID, undefined, "visibility-filter");
          scene.remove(currentModel);
          currentModel.geometry?.dispose?.();
        }

        const model = await ifcLoader.loadAsync(url);
        currentModel = model;
        scene.add(model);
        modelBounds = new THREE.Box3().setFromObject(model);

        const modelID = model.modelID;
        allProductIds = new Set(await ifcLoader.ifcManager.getAllItemsOfType(modelID, IFCPRODUCT, false));
        groupedTypeIds.walls = await collectTypeIds(modelID, [IFCWALL, IFCWALLSTANDARDCASE]);
        groupedTypeIds.slabs = await collectTypeIds(modelID, [IFCSLAB]);
        groupedTypeIds.doors = await collectTypeIds(modelID, [IFCDOOR]);
        await updateVisibilityFilters();
        if (sectionActive) applySectionView();

        fitCameraToObject(model);
        statusEl.textContent = `Loaded ${file.name}`;
        setEmptyMetadata("Model loaded. Click an IFC element to inspect.");
      } catch (error) {
        console.error(error);
        statusEl.textContent = "Failed to load IFC file. See browser console.";
      } finally {
        URL.revokeObjectURL(url);
      }
    };

    renderer.domElement.addEventListener("pointerdown", (event) => {
      pointerDown = { x: event.clientX, y: event.clientY };
    });

    renderer.domElement.addEventListener("pointerup", async (event) => {
      if (!currentModel || !pointerDown) return;

      const dx = event.clientX - pointerDown.x;
      const dy = event.clientY - pointerDown.y;
      pointerDown = null;

      if (Math.hypot(dx, dy) > 4) return;

      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const [hit] = raycaster.intersectObject(activePickTarget ?? currentModel, true);
      if (!hit || hit.faceIndex == null) {
        setEmptyMetadata("No IFC element selected.");
        return;
      }

      try {
        const modelID = currentModel.modelID;
        const expressID = ifcLoader.ifcManager.getExpressId(hit.object.geometry, hit.faceIndex);
        if (expressID == null || expressID < 0) {
          setEmptyMetadata("No IFC element selected.");
          return;
        }
        const properties = await ifcLoader.ifcManager.getItemProperties(modelID, expressID, true);
        setMetadata(modelID, expressID, properties);
      } catch (error) {
        console.error(error);
        setEmptyMetadata("Failed to read metadata for selected element.");
      }
    });

    for (const el of [filterWallsEl, filterSlabsEl, filterDoorsEl]) {
      el.addEventListener("change", () => {
        updateVisibilityFilters().catch((error) => {
          console.error(error);
          statusEl.textContent = "Failed to apply visibility filters.";
        });
      });
    }

    sectionOffsetEl.addEventListener("input", () => {
      sectionValueEl.textContent = `${sectionOffsetEl.value}%`;
      if (sectionActive) applySectionView();
    });
    sectionAxisEl.addEventListener("change", () => {
      if (sectionActive) applySectionView();
    });
    sectionApplyEl.addEventListener("click", applySectionView);
    sectionClearEl.addEventListener("click", clearSectionView);

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
    setEmptyMetadata("Click an IFC element to inspect its properties.");
  } catch (error) {
    console.error(error);
    runtimeReady = false;
    statusEl.textContent = "Failed to initialize viewer.";
  }
}

initViewer();

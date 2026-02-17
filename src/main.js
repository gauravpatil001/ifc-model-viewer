import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { IFCLoader } from "web-ifc-three/IFCLoader";
import { IFCPRODUCT } from "web-ifc";

const viewerRoot = document.getElementById("viewer");
const statusEl = document.getElementById("status");
const fileInput = document.getElementById("file-input");
const metaEmptyEl = document.getElementById("meta-empty");
const metaContentEl = document.getElementById("meta-content");
const filterListEl = document.getElementById("filter-list");
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
    THREE.Object3D.DEFAULT_UP.set(0, 0, 1);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf4f7fa);

    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 5000);
    camera.up.set(0, 0, 1);
    camera.position.set(12, -12, 10);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.localClippingEnabled = true;
    viewerRoot.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 0, 1.5);

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const dir = new THREE.DirectionalLight(0xffffff, 0.9);
    dir.position.set(20, -25, 24);
    scene.add(dir);

    const grid = new THREE.GridHelper(60, 60, 0xb8c4d0, 0xd8e1e8);
    grid.rotateX(Math.PI / 2);
    scene.add(grid);
    scene.add(new THREE.AxesHelper(2.5));

    const modelRoot = new THREE.Group();
    // IFC geometry is typically authored in Y-up; rotate once so world stays Z-up.
    modelRoot.rotation.x = Math.PI / 2;
    scene.add(modelRoot);

    const ifcLoader = new IFCLoader();
    ifcLoader.ifcManager.setWasmPath("/wasm/");

    let currentModel = null;
    let activePickTarget = null;
    let pointerDown = null;
    let modelBounds = null;
    let sectionActive = false;
    let allProductIds = new Set();
    let typeGroups = new Map();

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
      let normal = new THREE.Vector3(0, 0, -1);

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

    function buildDynamicFilterUI() {
      filterListEl.innerHTML = "";
      if (typeGroups.size === 0) {
        const span = document.createElement("span");
        span.className = "hint";
        span.textContent = "No filterable IFC categories found.";
        filterListEl.append(span);
        return;
      }

      const rows = Array.from(typeGroups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
      for (const [typeName, ids] of rows) {
        const label = document.createElement("label");
        const input = document.createElement("input");
        input.type = "checkbox";
        input.checked = true;
        input.dataset.typeName = typeName;
        input.addEventListener("change", () => {
          updateVisibilityFilters().catch((error) => {
            console.error(error);
            statusEl.textContent = "Failed to apply visibility filters.";
          });
        });
        label.append(input, `${typeName} (${ids.size})`);
        filterListEl.append(label);
      }
    }

    async function buildTypeGroups(modelID) {
      allProductIds = new Set(await ifcLoader.ifcManager.getAllItemsOfType(modelID, IFCPRODUCT, false));
      typeGroups = new Map();

      for (const expressID of allProductIds) {
        const rawType = await ifcLoader.ifcManager.getIfcType(modelID, expressID);
        const typeName = String(rawType || "UNKNOWN").toUpperCase();
        if (!typeGroups.has(typeName)) typeGroups.set(typeName, new Set());
        typeGroups.get(typeName).add(expressID);
      }
    }

    async function updateVisibilityFilters() {
      if (!currentModel) return;
      const modelID = currentModel.modelID;

      if (allProductIds.size === 0 || typeGroups.size === 0) {
        ifcLoader.ifcManager.removeSubset(modelID, undefined, "visibility-filter");
        activePickTarget = currentModel;
        currentModel.visible = true;
        renderer.render(scene, camera);
        return;
      }

      const hiddenIds = new Set();
      const checkboxes = filterListEl.querySelectorAll("input[type='checkbox']");
      for (const checkbox of checkboxes) {
        if (checkbox.checked) continue;
        const ids = typeGroups.get(checkbox.dataset.typeName);
        if (!ids) continue;
        for (const id of ids) hiddenIds.add(id);
      }

      const visibleIds = [];
      for (const id of allProductIds) {
        if (!hiddenIds.has(id)) visibleIds.push(id);
      }

      ifcLoader.ifcManager.createSubset({
        modelID,
        ids: visibleIds,
        scene: modelRoot,
        removePrevious: true,
        customID: "visibility-filter",
      });

      activePickTarget = ifcLoader.ifcManager.getSubset(modelID, undefined, "visibility-filter");
      if (visibleIds.length === 0) {
        currentModel.visible = false;
        activePickTarget = null;
      } else if (!activePickTarget) {
        currentModel.visible = true;
        activePickTarget = currentModel;
      } else {
        currentModel.visible = false;
      }

      renderer.render(scene, camera);
    }

    loadIfc = async (file) => {
      const url = URL.createObjectURL(file);
      statusEl.textContent = `Loading ${file.name}...`;
      try {
        if (currentModel) {
          ifcLoader.ifcManager.removeSubset(currentModel.modelID, undefined, "visibility-filter");
          modelRoot.remove(currentModel);
          currentModel.geometry?.dispose?.();
        }

        const model = await ifcLoader.loadAsync(url);
        currentModel = model;
        modelRoot.add(model);
        modelBounds = new THREE.Box3().setFromObject(modelRoot);

        statusEl.textContent = `Loaded ${file.name}. Building category filters...`;
        await buildTypeGroups(model.modelID);
        buildDynamicFilterUI();
        await updateVisibilityFilters();
        if (sectionActive) applySectionView();

        fitCameraToObject(modelRoot);
        statusEl.textContent = `Loaded ${file.name} (${typeGroups.size} categories)`;
        if (allProductIds.size === 0) {
          statusEl.textContent = `Loaded ${file.name} (filters unavailable for this model)`;
        }
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

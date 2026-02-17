export * from "three/examples/jsm/utils/BufferGeometryUtils.js";

// web-ifc-three expects mergeGeometries, but some Three.js versions export mergeBufferGeometries.
export { mergeBufferGeometries as mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

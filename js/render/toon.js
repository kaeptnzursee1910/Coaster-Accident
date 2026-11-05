// Cartoon-Materialien (Toon-Shading mit 3 Helligkeitsstufen).
import * as THREE from 'three';

let gradient = null;
export function gradientMap() {
  if (!gradient) {
    const data = new Uint8Array([110, 110, 110, 255, 185, 185, 185, 255, 255, 255, 255, 255]);
    gradient = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
    gradient.minFilter = THREE.NearestFilter;
    gradient.magFilter = THREE.NearestFilter;
    gradient.needsUpdate = true;
  }
  return gradient;
}

const cache = new Map();
export function toon(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!cache.has(key)) {
    cache.set(key, new THREE.MeshToonMaterial({ color, gradientMap: gradientMap(), ...opts }));
  }
  return cache.get(key);
}

// Neues (nicht geteiltes) Material, z. B. für Figuren, deren Farbe sich ändert.
export function toonUnique(color, opts = {}) {
  return new THREE.MeshToonMaterial({ color, gradientMap: gradientMap(), ...opts });
}

export function shade(hex, f) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(f);
  return '#' + c.getHexString();
}

// Schatten an/aus für eine ganze Gruppe
export function castAll(obj, cast = true, receive = false) {
  obj.traverse((o) => {
    if (o.isMesh) { o.castShadow = cast; o.receiveShadow = receive; }
  });
  return obj;
}

import {
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  type Color,
  DirectionalLight,
  EdgesGeometry,
  LineBasicMaterial,
  LineSegments,
  type Material,
  type Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  type Object3D,
  type Scene,
  ShaderMaterial,
  type Side,
} from 'three';
import type { Theme } from './engine';

// Shared building blocks, so every scene has the same drawn-in-ink look:
// flat-shaded solids in paper tones, thin ink outlines, round dots.
//
// Materials are handed the theme's live Color objects rather than copies. The
// engine updates those objects in place when the theme flips, so nothing here
// needs to be rebuilt.

export function lineMat(color: Color, opacity = 1): LineBasicMaterial {
  const m = new LineBasicMaterial({ transparent: opacity < 1, opacity });
  m.color = color;
  return m;
}

/** A lit, flat-shaded surface. */
export function solid(color: Color, side?: Side): MeshLambertMaterial {
  const m = new MeshLambertMaterial({ flatShading: true, ...(side === undefined ? {} : { side }) });
  m.color = color;
  return m;
}

/** An unlit surface: used for accents that should read as pure colour. */
export function flat(color: Color, opacity = 1): MeshBasicMaterial {
  const m = new MeshBasicMaterial({ transparent: opacity < 1, opacity });
  m.color = color;
  return m;
}

/** Give a mesh an ink outline along its hard edges. */
export function outline(mesh: Mesh, color: Color, opacity = 1, angle = 28): LineSegments {
  const lines = new LineSegments(new EdgesGeometry(mesh.geometry, angle), lineMat(color, opacity));
  mesh.add(lines);
  return lines;
}

/** The same soft key light for every scene. */
export function addLights(scene: Scene) {
  scene.add(new AmbientLight(0xffffff, 2.1));
  const key = new DirectionalLight(0xffffff, 1.5);
  key.position.set(2.5, 4, 3.5);
  scene.add(key);
}

/** A square grid of lines on the ground, like graph paper seen at an angle. */
export function gridFloor(size: number, divisions: number, y: number, color: Color, opacity: number): LineSegments {
  const half = size / 2;
  const step = size / divisions;
  const pts: number[] = [];
  for (let i = 0; i <= divisions; i++) {
    const p = -half + i * step;
    pts.push(-half, y, p, half, y, p, p, y, -half, p, y, half);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pts), 3));
  return new LineSegments(g, lineMat(color, opacity));
}

const DOT_VERTEX = /* glsl */ `
  attribute vec2 aMix;    // x: how much accent, y: how much "good"
  attribute float aAlpha;
  attribute float aSize;  // world units
  uniform float uScale;   // pixels per world unit at distance 1
  uniform float uGrow;    // extra size for accented dots
  uniform vec3 uInk;
  uniform vec3 uAccent;
  uniform vec3 uGood;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = max(1.0, aSize * (1.0 + uGrow * aMix.x) * uScale / -mv.z);
    vColor = mix(mix(uInk, uAccent, clamp(aMix.x, 0.0, 1.0)), uGood, clamp(aMix.y, 0.0, 1.0));
    vAlpha = aAlpha;
  }
`;

const DOT_FRAGMENT = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float r = dot(d, d);
    if (r > 0.25) discard;
    gl_FragColor = vec4(vColor, vAlpha * smoothstep(0.25, 0.14, r));
    #include <colorspace_fragment>
  }
`;

/** Round dots whose size shrinks with distance and whose colour blends ink -> accent -> good. */
export function dotMaterial(theme: Theme, grow = 0): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uScale: { value: 400 },
      uGrow: { value: grow },
      uInk: { value: theme.ink },
      uAccent: { value: theme.accent },
      uGood: { value: theme.good },
    },
    vertexShader: DOT_VERTEX,
    fragmentShader: DOT_FRAGMENT,
    transparent: true,
    depthWrite: false,
  });
}

/** Pixels per world unit at distance 1, for the dot material's size attenuation. */
export function dotScale(heightCss: number, pixelRatio: number, fovDegrees: number): number {
  return (heightCss * pixelRatio) / (2 * Math.tan((fovDegrees * Math.PI) / 360));
}

/** Geometry for dots: positions plus the per-dot attributes the dot material reads. */
export function dotGeometry(count: number): { geometry: BufferGeometry; position: Float32Array; mix: Float32Array; alpha: Float32Array; size: Float32Array } {
  const position = new Float32Array(count * 3);
  const mix = new Float32Array(count * 2);
  const alpha = new Float32Array(count);
  const size = new Float32Array(count);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(position, 3));
  geometry.setAttribute('aMix', new BufferAttribute(mix, 2));
  geometry.setAttribute('aAlpha', new BufferAttribute(alpha, 1));
  geometry.setAttribute('aSize', new BufferAttribute(size, 1));
  return { geometry, position, mix, alpha, size };
}

/** Free every geometry and material under a scene. */
export function disposeScene(root: Object3D) {
  root.traverse((o) => {
    const item = o as Object3D & { geometry?: BufferGeometry; material?: Material | Material[] };
    item.geometry?.dispose();
    if (Array.isArray(item.material)) item.material.forEach((m) => m.dispose());
    else item.material?.dispose();
  });
}

/** Deterministic random numbers, so a scene looks the same on every visit. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const easeInOut = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
export const easeOutBack = (p: number) => {
  const c = 1.70158;
  return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2);
};

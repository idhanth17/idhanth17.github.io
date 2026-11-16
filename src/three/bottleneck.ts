import {
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  Fog,
  Group,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Points,
  Scene,
  ShaderMaterial,
  TorusGeometry,
  Vector3,
} from 'three';
import type { SceneCtx, SceneDef } from './engine';
import { clamp01, disposeScene, dotGeometry, dotMaterial, dotScale, easeInOut, easeOutBack, gridFloor, lerp, lineMat, smooth } from './kit';

// The hero: "the bottleneck", drawn literally.
//
// A glass bottle lies on its side, packed with particles (work waiting to get
// through). They can only leave through the neck. A red ring finds the neck;
// then the neck opens, and the same bottle lets the flow through.
//
// The particles behave like an incompressible fluid: the same number per second
// passes every cross-section, so they crawl in the wide body and race through
// the narrow neck. The two flow rates are in the ratio of the real measured
// throughput (after / before), which is the only number this scene encodes.

export interface BottleneckOpts {
  /** after / before of the measured throughput. */
  ratio: number;
  /** Returns the element to pin to the bottle's neck (the handwritten annotation), once it exists. */
  label?: () => HTMLElement | null;
  /** Told the phase: 0 = before the fix, 1 = after. */
  onPhase?: (phase: number) => void;
}

// Bottle shape along its axis (x): rounded base, body, shoulder, neck, lip.
const X0 = -2.6;
const XB = -2.3;
const XS = 0.3;
const XN = 1.1;
const XL = 1.85;
const NECK_BEFORE = 0.2;
const NECK_AFTER = 0.5;
const FLOOR = -1.22;

function profile(x: number, neck: number): number {
  if (x <= X0) return 0;
  if (x < XB) {
    const u = (x - X0) / (XB - X0);
    return Math.sqrt(1 - (1 - u) * (1 - u));
  }
  if (x < XS) return 1;
  if (x < XN) {
    const u = (x - XS) / (XN - XS);
    return 1 + (neck - 1) * (u * u * (3 - 2 * u));
  }
  return neck + (x > XL - 0.1 ? 0.045 : 0);
}

/** Volume inside the bottle, used to turn a particle count into a density. */
function volume(neck: number): number {
  let v = 0;
  const steps = 64;
  const dx = (XL - XB) / steps;
  for (let i = 0; i < steps; i++) {
    const r = profile(XB + (i + 0.5) * dx, neck);
    v += Math.PI * r * r * dx;
  }
  return v;
}

const GLASS_VERTEX = /* glsl */ `
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalMatrix * normal;
    vV = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

// Glass is nearly invisible face-on and darkens toward its silhouette, with one bright streak of reflected light.
const GLASS_FRAGMENT = /* glsl */ `
  uniform vec3 uEdge;
  uniform vec3 uBody;
  uniform float uStrength;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vec3 n = normalize(vN);
    vec3 v = normalize(vV);
    if (!gl_FrontFacing) n = -n;
    float rim = pow(1.0 - abs(dot(n, v)), 2.3);
    float glint = pow(max(dot(reflect(-normalize(vec3(0.45, 0.85, 0.55)), n), v), 0.0), 70.0);
    vec3 color = mix(uBody, uEdge, rim);
    float alpha = (0.045 + 0.5 * rim) * uStrength + glint * 0.55;
    gl_FragColor = vec4(mix(color, vec3(1.0), glint * 0.85), alpha);
    #include <colorspace_fragment>
  }
`;

const SHADOW_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uAlpha;
  varying vec2 vUv;
  void main() {
    float d = distance(vUv, vec2(0.5)) * 2.0;
    gl_FragColor = vec4(uColor, pow(max(0.0, 1.0 - d), 1.7) * uAlpha);
    #include <colorspace_fragment>
  }
`;

const UV_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// The loop: hold "before", open the neck, hold "after" (the longest part), close again.
const T_BEFORE = 3.4;
const T_FIX = 1.5;
const T_AFTER = 7.6;
const T_BACK = 1.1;
const T_LOOP = T_BEFORE + T_FIX + T_AFTER + T_BACK;

function phaseAt(clock: number): number {
  let c = clock % T_LOOP;
  if (c < T_BEFORE) return 0;
  c -= T_BEFORE;
  if (c < T_FIX) return easeInOut(c / T_FIX);
  c -= T_FIX;
  if (c < T_AFTER) return 1;
  return 1 - easeInOut((c - T_AFTER) / T_BACK);
}

export function bottleneck(ctx: SceneCtx, opts: BottleneckOpts): SceneDef {
  const { theme } = ctx;
  const ratio = Number.isFinite(opts.ratio) && opts.ratio > 1 ? Math.min(opts.ratio, 4) : 1.75;
  const N = ctx.lowPower ? 1300 : 2800;
  const FOV = 30;

  const scene = new Scene();
  scene.fog = new Fog(theme.paper.getHex(), 9, 18);
  const camera = new PerspectiveCamera(FOV, 1, 0.1, 60);

  const world = new Group(); // everything that turns with the pointer
  world.position.set(-0.35, 0.12, 0);
  scene.add(world);

  // ---- ground: graph paper and a soft contact shadow
  const floor = gridFloor(22, 44, FLOOR, theme.ink, 0.11);
  scene.add(floor);
  const shadow = new Mesh(
    new CircleGeometry(1, 48),
    new ShaderMaterial({
      uniforms: { uColor: { value: theme.ink }, uAlpha: { value: 0.2 } },
      vertexShader: UV_VERTEX,
      fragmentShader: SHADOW_FRAGMENT,
      transparent: true,
      depthWrite: false,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(-0.2, FLOOR - world.position.y + 0.004, 0);
  shadow.scale.set(3.3, 1.35, 1);
  world.add(shadow);

  // ---- the bottle: one glass surface plus a few ink rings, both reshaped as the neck opens
  const NX = 76;
  const NT = 56;
  const glassPos = new Float32Array((NX + 1) * (NT + 1) * 3);
  const glassNrm = new Float32Array((NX + 1) * (NT + 1) * 3);
  const index: number[] = [];
  for (let i = 0; i < NX; i++) {
    for (let j = 0; j < NT; j++) {
      const a = i * (NT + 1) + j;
      const b = a + NT + 1;
      index.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const glassGeo = new BufferGeometry();
  glassGeo.setAttribute('position', new BufferAttribute(glassPos, 3).setUsage(DynamicDrawUsage));
  glassGeo.setAttribute('normal', new BufferAttribute(glassNrm, 3).setUsage(DynamicDrawUsage));
  glassGeo.setIndex(index);
  const glass = new Mesh(
    glassGeo,
    new ShaderMaterial({
      uniforms: { uEdge: { value: theme.ink }, uBody: { value: theme.paper3 }, uStrength: { value: 1 } },
      vertexShader: GLASS_VERTEX,
      fragmentShader: GLASS_FRAGMENT,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
    }),
  );
  glass.frustumCulled = false;
  glass.renderOrder = 2;
  world.add(glass);

  const RING_X = [XB, XS, XN, XL - 0.05, XL];
  const RING_SEG = 72;
  const ringPos = new Float32Array(RING_X.length * RING_SEG * 6);
  const ringGeo = new BufferGeometry();
  ringGeo.setAttribute('position', new BufferAttribute(ringPos, 3).setUsage(DynamicDrawUsage));
  const rings = new LineSegments(ringGeo, lineMat(theme.ink, 0.5));
  rings.frustumCulled = false;
  rings.renderOrder = 3;
  world.add(rings);

  let shapedFor = -1;
  const shape = (neck: number) => {
    if (Math.abs(neck - shapedFor) < 0.0005) return;
    shapedFor = neck;
    let k = 0;
    for (let i = 0; i <= NX; i++) {
      const x = X0 + ((XL - X0) * i) / NX;
      const r = profile(x, neck);
      const slope = (profile(x + 0.02, neck) - profile(x - 0.02, neck)) / 0.04;
      const inv = 1 / Math.hypot(slope, 1);
      for (let j = 0; j <= NT; j++) {
        const th = (j / NT) * Math.PI * 2;
        const c = Math.cos(th);
        const s = Math.sin(th);
        glassPos[k] = x;
        glassPos[k + 1] = r * c;
        glassPos[k + 2] = r * s;
        glassNrm[k] = -slope * inv;
        glassNrm[k + 1] = c * inv;
        glassNrm[k + 2] = s * inv;
        k += 3;
      }
    }
    glassGeo.attributes.position.needsUpdate = true;
    glassGeo.attributes.normal.needsUpdate = true;
    k = 0;
    for (const x of RING_X) {
      const r = profile(x, neck);
      for (let j = 0; j < RING_SEG; j++) {
        const a = (j / RING_SEG) * Math.PI * 2;
        const b = ((j + 1) / RING_SEG) * Math.PI * 2;
        ringPos[k++] = x;
        ringPos[k++] = r * Math.cos(a);
        ringPos[k++] = r * Math.sin(a);
        ringPos[k++] = x;
        ringPos[k++] = r * Math.cos(b);
        ringPos[k++] = r * Math.sin(b);
      }
    }
    ringGeo.attributes.position.needsUpdate = true;
  };

  // ---- the red-pen ring that marks the neck
  const markColor = new Color();
  const mark = new Mesh(new TorusGeometry(1, 0.04, 10, 72), new MeshBasicMaterial({ color: 0xffffff }));
  (mark.material as MeshBasicMaterial).color = markColor;
  mark.rotation.y = Math.PI / 2;
  mark.position.x = (XN + XL) / 2;
  mark.renderOrder = 4;
  world.add(mark);

  // ---- the particles
  const dots = dotGeometry(N);
  (dots.geometry.attributes.position as BufferAttribute).setUsage(DynamicDrawUsage);
  (dots.geometry.attributes.aMix as BufferAttribute).setUsage(DynamicDrawUsage);
  (dots.geometry.attributes.aAlpha as BufferAttribute).setUsage(DynamicDrawUsage);
  const dotMat = dotMaterial(theme);
  const points = new Points(dots.geometry, dotMat);
  points.frustumCulled = false;
  points.renderOrder = 1;
  world.add(points);

  const px = new Float32Array(N); // position along the axis
  const rf = new Float32Array(N); // fraction of the local radius (0 = on the axis)
  const ang = new Float32Array(N);
  const spin = new Float32Array(N);
  const seed = new Float32Array(N);
  const outside = new Uint8Array(N);
  const oy = new Float32Array(N);
  const oz = new Float32Array(N);
  const vx = new Float32Array(N);
  const vy = new Float32Array(N);
  const vz = new Float32Array(N);
  const laneY = new Float32Array(N);
  const laneZ = new Float32Array(N);

  const enter = (i: number, spread: boolean) => {
    outside[i] = 0;
    // Uniform in volume: wide sections hold proportionally more particles.
    let x = XB;
    if (spread) {
      for (let tries = 0; tries < 12; tries++) {
        x = XB + Math.random() * (XL - XB);
        const r = profile(x, NECK_BEFORE);
        if (Math.random() < r * r) break;
      }
    } else x = XB + Math.random() * 0.12;
    px[i] = x;
    rf[i] = Math.sqrt(Math.random());
    ang[i] = Math.random() * Math.PI * 2;
  };
  for (let i = 0; i < N; i++) {
    seed[i] = Math.random();
    spin[i] = (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random());
    dots.size[i] = 0.026 + Math.random() * 0.03;
    enter(i, true);
  }
  (dots.geometry.attributes.aSize as BufferAttribute).needsUpdate = true;

  const QB = N / 38; // particles per second before the fix

  const step = (dt: number, phase: number, time: number) => {
    const neck = lerp(NECK_BEFORE, NECK_AFTER, phase);
    let inside = 0;
    for (let i = 0; i < N; i++) if (!outside[i]) inside++;
    const density = Math.max(1, inside) / volume(neck);
    // While it is jammed the flow stutters; once fixed it is steady.
    const stutter = 1 + (1 - phase) * 0.6 * Math.sin(time * 5.1) * Math.sin(time * 1.7 + 1.3);
    const flow = lerp(QB, QB * ratio, phase) * stutter;
    const pos = dots.position;
    const mix = dots.mix;
    const alpha = dots.alpha;

    for (let i = 0; i < N; i++) {
      const k = i * 3;
      if (!outside[i]) {
        const x = px[i];
        const r = profile(x, neck);
        const speed = Math.min(3.2, flow / (density * Math.PI * Math.max(r * r, 0.012)));
        const nx = x + speed * dt;
        ang[i] += spin[i] * (0.22 + 1.9 * speed) * dt;
        if (nx >= XL) {
          // Out through the neck.
          outside[i] = 1;
          px[i] = XL;
          const rr = rf[i] * neck * 0.88;
          oy[i] = rr * Math.cos(ang[i]);
          oz[i] = rr * Math.sin(ang[i]);
          vx[i] = Math.max(1.35, Math.min(3, speed));
          vy[i] = (Math.random() - 0.5) * 0.3;
          vz[i] = (Math.random() - 0.5) * 0.3;
          laneY[i] = Math.round(oy[i] / 0.11) * 0.11;
          laneZ[i] = Math.round(oz[i] / 0.11) * 0.11;
        } else px[i] = nx;
        const jam = (1 - phase) * smooth(-0.7, 1.05, px[i]);
        const shake = jam * 0.02;
        const rr = rf[i] * profile(px[i], neck) * 0.9;
        pos[k] = px[i] + (Math.random() - 0.5) * shake;
        pos[k + 1] = rr * Math.cos(ang[i]) + (Math.random() - 0.5) * shake;
        pos[k + 2] = rr * Math.sin(ang[i]) + (Math.random() - 0.5) * shake;
        mix[i * 2] = jam;
        mix[i * 2 + 1] = phase * smooth(0.1, 1.2, px[i]);
        alpha[i] = 0.5 + 0.45 * seed[i];
      } else {
        px[i] += vx[i] * dt;
        const d = px[i] - XL;
        // Before the fix the trickle droops and scatters; after it, the stream holds its lanes and fans out.
        vy[i] -= (1 - phase) * 2.6 * dt;
        oy[i] += vy[i] * dt;
        oz[i] += vz[i] * dt;
        if (phase > 0.02) {
          const fan = 1 + d * 0.62;
          const pull = Math.min(1, 5 * dt) * phase;
          oy[i] += (laneY[i] * fan - oy[i]) * pull;
          oz[i] += (laneZ[i] * fan - oz[i]) * pull;
          vy[i] *= 1 - pull;
          vz[i] *= 1 - pull;
        }
        if (d > 4.4 || oy[i] < FLOOR - world.position.y + 0.03) {
          enter(i, false);
          pos[k] = px[i];
          pos[k + 1] = 0;
          pos[k + 2] = 0;
          alpha[i] = 0;
          continue;
        }
        pos[k] = px[i];
        pos[k + 1] = oy[i];
        pos[k + 2] = oz[i];
        mix[i * 2] = (1 - phase) * 0.55;
        mix[i * 2 + 1] = phase;
        alpha[i] = (1 - smooth(2.4, 4.4, d)) * (0.5 + 0.5 * seed[i]);
      }
    }
    dots.geometry.attributes.position.needsUpdate = true;
    dots.geometry.attributes.aMix.needsUpdate = true;
    dots.geometry.attributes.aAlpha.needsUpdate = true;
  };

  // ---- time, phase and the annotation
  let clock = 0;
  let still = 1; // with reduced motion there is no timeline: the phase is whichever state was last asked for
  let found = false;
  let sent = -1;
  const anchor = new Vector3();
  const screen = { x: 0, y: 0 };

  if (ctx.reduced) {
    // A single still frame: show the fixed state, with the stream already established.
    clock = T_BEFORE + T_FIX + 1;
    found = true;
    for (let i = 0; i < 260; i++) step(1 / 30, 1, i / 30);
  }

  shape(NECK_BEFORE);

  return {
    scene,
    camera,
    resize(width, height, pixelRatio) {
      const aspect = width / height;
      // Keep the whole bottle in frame however narrow the canvas gets.
      const distance = Math.max(9.1, 6.7 / (2 * Math.tan((FOV * Math.PI) / 360) * aspect));
      camera.position.set(-0.2, 0.9, distance);
      camera.lookAt(-0.2, -0.1, 0);
      camera.updateMatrixWorld();
      dotMat.uniforms.uScale.value = dotScale(height, pixelRatio, FOV);
    },
    update(time, dt, pointer) {
      clock += dt;
      const phase = ctx.reduced ? still : phaseAt(clock);
      const neck = lerp(NECK_BEFORE, NECK_AFTER, phase);
      shape(neck);
      if (dt > 0) step(dt, phase, time);

      world.rotation.y = -0.5 + (ctx.reduced ? 0 : 0.14 * Math.sin(time * 0.21)) + pointer.x * 0.13;
      world.rotation.x = 0.1 + pointer.y * 0.05;
      world.rotation.z = 0.05;

      // The pen ring: drawn on shortly after the start, then it stays and turns green with the fix.
      const seen = clock % T_LOOP;
      if (!found && seen > 0.8) found = true;
      const grow = found ? (clock < 1.6 && !ctx.reduced ? easeOutBack(clamp01((clock - 0.8) / 0.6)) : 1) : 0;
      mark.scale.setScalar(Math.max(0.0001, (neck + 0.13) * grow));
      markColor.copy(theme.accent).lerp(theme.good, phase);

      const label = opts.label?.();
      if (label) {
        world.updateMatrixWorld();
        anchor.set((XN + XL) / 2, neck + 0.16, 0).applyMatrix4(world.matrixWorld);
        ctx.project(anchor, screen);
        label.style.transform = `translate(${screen.x.toFixed(1)}px, ${screen.y.toFixed(1)}px)`;
        label.style.opacity = found ? '1' : '0';
        const next = phase > 0.5 ? 'after' : 'before';
        if (label.dataset.phase !== next) label.dataset.phase = next;
      }

      if (opts.onPhase && phase !== sent && (Math.abs(phase - sent) > 0.012 || phase === 0 || phase === 1)) {
        sent = phase;
        opts.onPhase(phase);
      }
    },
    retheme() {
      scene.fog?.color.copy(theme.paper);
    },
    message(data) {
      const target = (data as { phase?: number } | null)?.phase;
      if (ctx.reduced) {
        if (target === 0 || target === 1) still = target;
        return;
      }
      const current = phaseAt(clock);
      // Jump to the start of the matching transition, so the change is animated rather than cut.
      if (target === 1 && current < 0.5) clock = T_BEFORE;
      else if (target === 0 && current >= 0.5) clock = T_BEFORE + T_FIX + T_AFTER;
    },
    dispose() {
      disposeScene(scene);
    },
  };
}

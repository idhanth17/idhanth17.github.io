import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  DynamicDrawUsage,
  Group,
  Line,
  LineLoop,
  Mesh,
  PerspectiveCamera,
  Points,
  Scene,
  Vector3,
} from 'three';
import type { SceneCtx, SceneDef } from './engine';
import { addLights, disposeScene, dotGeometry, dotMaterial, dotScale, flat, lineMat, outline, rng, solid } from './kit';

// Telemetry, drawn in 3D: a ring of developer machines, each streaming what its
// AI coding tools did to one server, which turns it into a dashboard.
// The number of machines is the real size of the fleet; the four dot styles
// stand for the four tools that are captured.

export interface FleetOpts {
  count: number;
}

const BARS = 6;
const PACKETS = 44;

export function fleet(ctx: SceneCtx, opts: FleetOpts): SceneDef {
  const { theme } = ctx;
  const machines = Math.max(3, Math.min(24, Math.round(opts.count) || 10));
  const FOV = 34;
  const rand = rng(1061);

  const scene = new Scene();
  addLights(scene);
  const camera = new PerspectiveCamera(FOV, 1, 0.1, 40);
  const rig = new Group();
  scene.add(rig);

  // ---- the server: three stacked units with a status light each
  const unit = new BoxGeometry(1.15, 0.2, 0.8);
  const led = new BoxGeometry(0.05, 0.05, 0.02);
  const leds: Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const box = new Mesh(unit, solid(theme.paper3));
    box.position.y = -0.82 + i * 0.25;
    outline(box, theme.ink, 0.9);
    rig.add(box);
    const light = new Mesh(led, flat(theme.good));
    light.position.set(-0.43, box.position.y, 0.41);
    rig.add(light);
    leds.push(light);
  }
  const top = new Vector3(0, -0.2, 0);

  // ---- the dashboard: a panel floating above the server, with bars that rise as data arrives
  const panel = new Group();
  panel.position.set(0, 0.62, 0);
  panel.rotation.x = -0.12;
  rig.add(panel);
  const frameGeo = new BufferGeometry();
  frameGeo.setAttribute('position', new BufferAttribute(new Float32Array([-0.8, -0.48, 0, 0.8, -0.48, 0, 0.8, 0.48, 0, -0.8, 0.48, 0]), 3));
  panel.add(new LineLoop(frameGeo, lineMat(theme.ink, 0.9)));
  const sheet = new Mesh(new BoxGeometry(1.6, 0.96, 0.012), flat(theme.paper2, 0.82));
  sheet.position.z = -0.02;
  panel.add(sheet);
  const barGeo = new BoxGeometry(0.15, 1, 0.05);
  barGeo.translate(0, 0.5, 0); // grow upward from the baseline
  const bars: Mesh[] = [];
  const level = new Float32Array(BARS).fill(0.2);
  for (let i = 0; i < BARS; i++) {
    const bar = new Mesh(barGeo, flat(i === 2 ? theme.accent : theme.ink));
    bar.position.set(-0.56 + i * 0.224, -0.36, 0.03);
    panel.add(bar);
    bars.push(bar);
  }

  // ---- the machines, their links to the server, and the packets on those links
  const base = new BoxGeometry(0.38, 0.03, 0.27);
  const lid = new BoxGeometry(0.38, 0.25, 0.02);
  const from: Vector3[] = [];
  const bend: Vector3[] = [];
  for (let i = 0; i < machines; i++) {
    const a = (i / machines) * Math.PI * 2 + 0.3;
    const p = new Vector3(Math.cos(a) * 2.55, -0.55 + rand() * 0.75, Math.sin(a) * 1.9);
    const laptop = new Group();
    const deck = new Mesh(base, solid(theme.paper2));
    outline(deck, theme.ink, 0.85);
    const screen = new Mesh(lid, solid(theme.paper3));
    screen.position.set(0, 0.125, -0.135);
    screen.rotation.x = -0.28;
    outline(screen, theme.ink, 0.85);
    laptop.add(deck, screen);
    laptop.position.copy(p);
    laptop.lookAt(0, p.y, 0);
    laptop.rotateY(Math.PI); // open toward the outside, where its user sits
    rig.add(laptop);

    from.push(p.clone().setY(p.y + 0.12));
    bend.push(new Vector3(p.x * 0.5, 1.15 + rand() * 0.5, p.z * 0.5));
    const pts: number[] = [];
    for (let s = 0; s <= 28; s++) {
      const q = arc(from[i], bend[i], top, s / 28);
      pts.push(q.x, q.y, q.z);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(pts), 3));
    rig.add(new Line(g, lineMat(theme.ink, 0.16)));
  }

  const dots = dotGeometry(PACKETS);
  (dots.geometry.attributes.position as BufferAttribute).setUsage(DynamicDrawUsage);
  (dots.geometry.attributes.aAlpha as BufferAttribute).setUsage(DynamicDrawUsage);
  const dotMat = dotMaterial(theme);
  const packets = new Points(dots.geometry, dotMat);
  packets.frustumCulled = false;
  rig.add(packets);
  const lane = new Int16Array(PACKETS);
  const along = new Float32Array(PACKETS);
  const pace = new Float32Array(PACKETS);
  const tool = new Uint8Array(PACKETS);
  const launch = (i: number, start: number) => {
    lane[i] = Math.floor(Math.random() * machines);
    along[i] = start;
    pace[i] = 0.32 + Math.random() * 0.3;
    tool[i] = Math.floor(Math.random() * 4);
    // Four tools, four dot styles: ink, accent, good, and a paler ink.
    dots.mix[i * 2] = tool[i] === 1 ? 1 : 0;
    dots.mix[i * 2 + 1] = tool[i] === 2 ? 1 : 0;
    dots.size[i] = tool[i] === 3 ? 0.05 : 0.065;
    dots.geometry.attributes.aMix.needsUpdate = true;
    dots.geometry.attributes.aSize.needsUpdate = true;
  };
  for (let i = 0; i < PACKETS; i++) launch(i, Math.random());
  let blink = 0;
  const q = new Vector3();

  const place = () => {
    for (let i = 0; i < PACKETS; i++) {
      arc(from[lane[i]], bend[lane[i]], top, along[i], q);
      dots.position[i * 3] = q.x;
      dots.position[i * 3 + 1] = q.y;
      dots.position[i * 3 + 2] = q.z;
      dots.alpha[i] = Math.min(1, along[i] * 8) * (tool[i] === 3 ? 0.55 : 0.95);
    }
    dots.geometry.attributes.position.needsUpdate = true;
    dots.geometry.attributes.aAlpha.needsUpdate = true;
  };

  return {
    scene,
    camera,
    resize(width, height, pixelRatio) {
      const aspect = width / height;
      camera.position.set(0, 1.25, Math.max(6.5, 6.1 / (2 * Math.tan((FOV * Math.PI) / 360) * aspect)));
      camera.lookAt(0, 0.08, 0);
      dotMat.uniforms.uScale.value = dotScale(height, pixelRatio, FOV);
    },
    update(time, dt, pointer) {
      for (let i = 0; i < PACKETS; i++) {
        along[i] += pace[i] * dt;
        if (along[i] >= 1) {
          // Arrived: the dashboard reacts, then the packet starts again from some machine.
          const b = (tool[i] + lane[i]) % BARS;
          level[b] = Math.min(0.78, level[b] + 0.16);
          blink = 1;
          launch(i, 0);
        }
      }
      place();
      for (let i = 0; i < BARS; i++) {
        level[i] += (0.16 - level[i]) * Math.min(1, dt * 0.55);
        bars[i].scale.y = level[i];
      }
      blink = Math.max(0, blink - dt * 3);
      leds.forEach((l, i) => l.scale.setScalar(1 + blink * (i === 2 ? 1.6 : 0.6)));

      rig.rotation.y = (ctx.reduced ? 0.45 : 0.45 + 0.5 * Math.sin(time * 0.24)) + pointer.x * 0.3;
      rig.rotation.x = pointer.y * 0.12;
    },
    dispose() {
      disposeScene(scene);
    },
  };
}

/** A point on the curve that leaves a, bends toward b and lands on c. */
function arc(a: Vector3, b: Vector3, c: Vector3, t: number, out = new Vector3()): Vector3 {
  const u = 1 - t;
  return out.set(u * u * a.x + 2 * u * t * b.x + t * t * c.x, u * u * a.y + 2 * u * t * b.y + t * t * c.y, u * u * a.z + 2 * u * t * b.z + t * t * c.z);
}

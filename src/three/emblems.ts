import {
  BackSide,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Line,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PerspectiveCamera,
  Points,
  Quaternion,
  Scene,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import type { SceneCtx, SceneDef } from './engine';
import { addLights, clamp01, disposeScene, dotGeometry, dotMaterial, dotScale, easeOutBack, flat, lineMat, outline, rng, smooth, solid } from './kit';

// Small 3D emblems: one per featured project, plus the paper plane in the contact
// section. Each is a few dozen shapes at most, so a whole row of them is cheap.

interface Stage {
  scene: Scene;
  camera: PerspectiveCamera;
  root: Group;
  fov: number;
}

function stage(fov: number, lit = true): Stage {
  const scene = new Scene();
  if (lit) addLights(scene);
  const camera = new PerspectiveCamera(fov, 1, 0.1, 40);
  const root = new Group();
  scene.add(root);
  return { scene, camera, root, fov };
}

/**
 * Pull the camera back just far enough that `span` world units fit across the canvas.
 * `shift` slides the subject to the right (as a fraction of half the view), leaving the
 * left of a project cover free for its label; it is also nudged slightly up.
 */
function frame(s: Stage, width: number, height: number, span: number, minDistance: number, y = 0, shift = 0.34) {
  const aspect = width / height;
  const tan = Math.tan((s.fov * Math.PI) / 360);
  const distance = Math.max(minDistance, (span * (1 + shift)) / (2 * tan * aspect));
  const cx = -shift * distance * tan * aspect;
  const cy = shift ? -0.12 * distance * tan : 0;
  s.camera.position.set(cx, y + cy, distance);
  s.camera.lookAt(cx, cy, 0);
}

// ---------------------------------------------------------------------------
// Flash Point: a 3D sound meter, bursting the way speech does.
export function waveform(ctx: SceneCtx): SceneDef {
  const { theme } = ctx;
  const s = stage(30);
  const COUNT = 26;
  const geo = new BoxGeometry(0.1, 1, 0.34);
  geo.translate(0, 0.5, 0);
  const bars = new InstancedMesh(geo, new MeshLambertMaterial({ color: 0xffffff }), COUNT);
  bars.instanceMatrix.setUsage(DynamicDrawUsage);
  s.root.add(bars);
  const base = new Mesh(new BoxGeometry(COUNT * 0.15 + 0.3, 0.03, 0.6), solid(theme.paper3));
  base.position.y = -0.02;
  outline(base, theme.ink, 0.7);
  s.root.add(base);
  s.root.position.y = -0.55;
  const m = new Matrix4();
  const tint = new Color();
  return {
    scene: s.scene,
    camera: s.camera,
    resize: (w, h) => frame(s, w, h, 5.0, 5.2, 0.9),
    update(time, _dt, pointer) {
      const t = ctx.reduced ? 2.2 : time;
      for (let i = 0; i < COUNT; i++) {
        const talk = 0.32 + 0.68 * smooth(-0.7, 0.6, Math.sin(t * 0.9 + i * 0.07) + Math.sin(t * 0.37 + 2)); // speech comes in bursts, but the meter never goes dead
        const wave = Math.abs(Math.sin(i * 0.62 + t * 3.4) * Math.sin(i * 0.23 - t * 1.9));
        const h = 0.08 + talk * (0.18 + wave * 1.25);
        m.makeScale(1, h, 1).setPosition((i - (COUNT - 1) / 2) * 0.15, 0, 0);
        bars.setMatrixAt(i, m);
        bars.setColorAt(i, tint.copy(theme.ink3).lerp(theme.accent, smooth(0.75, 1.15, h)));
      }
      bars.instanceMatrix.needsUpdate = true;
      if (bars.instanceColor) bars.instanceColor.needsUpdate = true;
      s.root.rotation.y = -0.42 + pointer.x * 0.35;
      s.root.rotation.x = 0.1 + pointer.y * 0.12;
    },
    dispose: () => disposeScene(s.scene),
  };
}

// ---------------------------------------------------------------------------
// Psychic Lottery Optimizer: the 17 tickets of the covering set, as a slow orbit of balls.
export function lottery(ctx: SceneCtx): SceneDef {
  const { theme } = ctx;
  const s = stage(32);
  const COUNT = 17;
  const ball = new SphereGeometry(0.21, 20, 14);
  const body = new InstancedMesh(ball, new MeshLambertMaterial({ color: 0xffffff }), COUNT);
  // An ink shell seen from the inside draws each ball's outline.
  const shell = new InstancedMesh(ball, new MeshBasicMaterial({ color: 0xffffff, side: BackSide }), COUNT);
  (shell.material as MeshBasicMaterial).color = theme.ink;
  s.root.add(shell, body);
  const m = new Matrix4();
  const tint = new Color();
  const p = new Vector3();
  const one = new Vector3(1, 1, 1);
  const big = new Vector3(1.09, 1.09, 1.09);
  const q = new Quaternion();
  return {
    scene: s.scene,
    camera: s.camera,
    resize: (w, h) => frame(s, w, h, 3.5, 4.6),
    update(time, _dt, pointer) {
      const t = ctx.reduced ? 1 : time;
      for (let i = 0; i < COUNT; i++) {
        // Evenly spread over a sphere, each bobbing a little.
        const y = 1 - ((i + 0.5) / COUNT) * 2;
        const r = Math.sqrt(1 - y * y);
        const a = i * 2.399963 + t * 0.12;
        const lift = 0.06 * Math.sin(t * 1.3 + i);
        p.set(Math.cos(a) * r * 1.02, y * 0.86 + lift, Math.sin(a) * r * 1.02);
        body.setMatrixAt(i, m.compose(p, q, one));
        shell.setMatrixAt(i, m.compose(p, q, big));
        body.setColorAt(i, tint.copy(i === 4 ? theme.accent : i % 3 === 0 ? theme.paper3 : theme.paper2));
      }
      body.instanceMatrix.needsUpdate = true;
      shell.instanceMatrix.needsUpdate = true;
      if (body.instanceColor) body.instanceColor.needsUpdate = true;
      s.root.rotation.y = (ctx.reduced ? 0.4 : time * 0.28) + pointer.x * 0.5;
      s.root.rotation.x = 0.2 + pointer.y * 0.25;
    },
    dispose: () => disposeScene(s.scene),
  };
}

// ---------------------------------------------------------------------------
// Screen Track: five categories of time, as nested rings that fill.
export function rings(ctx: SceneCtx): SceneDef {
  const { theme } = ctx;
  const s = stage(30);
  const fills = [0.82, 0.64, 0.5, 0.36, 0.22];
  const tones = [theme.ink, theme.accent, theme.ink3, theme.good, theme.ink];
  const arcs: Mesh[] = [];
  fills.forEach((f, i) => {
    const radius = 1.18 - i * 0.2;
    const track = new Mesh(new TorusGeometry(radius, 0.012, 6, 90), flat(theme.ink, 0.22));
    const arc = new Mesh(new TorusGeometry(radius, 0.062, 10, 90, Math.PI * 2 * f), solid(tones[i]));
    arc.rotation.z = Math.PI / 2; // start every ring at the top
    arc.scale.x = -1; // and fill it clockwise
    (arc.material as MeshLambertMaterial).side = DoubleSide;
    s.root.add(track, arc);
    arcs.push(arc);
  });
  return {
    scene: s.scene,
    camera: s.camera,
    resize: (w, h) => frame(s, w, h, 3.4, 5.2),
    update(time, _dt, pointer) {
      const t = ctx.reduced ? 0 : time;
      arcs.forEach((arc, i) => {
        arc.rotation.z = Math.PI / 2 + Math.sin(t * 0.5 + i * 0.9) * 0.16;
      });
      s.root.rotation.x = -0.62 + pointer.y * 0.25;
      s.root.rotation.y = 0.38 + Math.sin(t * 0.3) * 0.16 + pointer.x * 0.4;
    },
    dispose: () => disposeScene(s.scene),
  };
}

// ---------------------------------------------------------------------------
// Anvil: an anvil, struck now and then.
export function anvil(ctx: SceneCtx): SceneDef {
  const { theme } = ctx;
  const s = stage(30);
  const steel = () => solid(theme.ink2);
  const part = (w: number, h: number, d: number, x: number, y: number) => {
    const mesh = new Mesh(new BoxGeometry(w, h, d), steel());
    mesh.position.set(x, y, 0);
    outline(mesh, theme.paper, 0.55);
    s.root.add(mesh);
    return mesh;
  };
  part(1.5, 0.2, 0.8, 0, -0.72); // foot
  part(1.0, 0.16, 0.6, 0, -0.54);
  part(0.56, 0.42, 0.42, 0, -0.25); // waist
  part(1.5, 0.34, 0.6, 0.05, 0.13); // face
  part(0.34, 0.14, 0.6, -0.86, 0.23); // heel
  const horn = new Mesh(new ConeGeometry(0.2, 0.86, 10), steel());
  horn.rotation.z = -Math.PI / 2;
  horn.position.set(1.23, 0.13, 0);
  outline(horn, theme.paper, 0.4, 40);
  s.root.add(horn);

  const SPARKS = 26;
  const dots = dotGeometry(SPARKS);
  (dots.geometry.attributes.position as BufferAttribute).setUsage(DynamicDrawUsage);
  (dots.geometry.attributes.aAlpha as BufferAttribute).setUsage(DynamicDrawUsage);
  const dotMat = dotMaterial(theme);
  const sparks = new Points(dots.geometry, dotMat);
  sparks.frustumCulled = false;
  s.root.add(sparks);
  const vel = new Float32Array(SPARKS * 3);
  for (let i = 0; i < SPARKS; i++) {
    dots.mix[i * 2] = 1;
    dots.size[i] = 0.05 + Math.random() * 0.04;
  }
  let since = 1.2;
  const strike = () => {
    for (let i = 0; i < SPARKS; i++) {
      dots.position[i * 3] = 0.2 + (Math.random() - 0.5) * 0.2;
      dots.position[i * 3 + 1] = 0.32;
      dots.position[i * 3 + 2] = (Math.random() - 0.5) * 0.2;
      vel[i * 3] = (Math.random() - 0.5) * 2.4;
      vel[i * 3 + 1] = 1.2 + Math.random() * 2.2;
      vel[i * 3 + 2] = (Math.random() - 0.5) * 2.4;
    }
  };
  return {
    scene: s.scene,
    camera: s.camera,
    resize(w, h, ratio) {
      frame(s, w, h, 4.2, 5.4, 0.5);
      dotMat.uniforms.uScale.value = dotScale(h, ratio, s.fov);
    },
    update(time, dt, pointer) {
      since += dt;
      if (since > 2.4) {
        since = 0;
        strike();
      }
      for (let i = 0; i < SPARKS; i++) {
        vel[i * 3 + 1] -= 6.5 * dt;
        dots.position[i * 3] += vel[i * 3] * dt;
        dots.position[i * 3 + 1] += vel[i * 3 + 1] * dt;
        dots.position[i * 3 + 2] += vel[i * 3 + 2] * dt;
        dots.alpha[i] = ctx.reduced ? 0 : clamp01(1 - since / 0.75);
      }
      dots.geometry.attributes.position.needsUpdate = true;
      dots.geometry.attributes.aAlpha.needsUpdate = true;
      // The whole anvil dips a hair when struck.
      s.root.position.y = -0.03 * clamp01(1 - since / 0.25);
      s.root.rotation.y = (ctx.reduced ? -0.5 : -0.5 + time * 0.22) + pointer.x * 0.4;
      s.root.rotation.x = 0.16 + pointer.y * 0.15;
    },
    dispose: () => disposeScene(s.scene),
  };
}

// ---------------------------------------------------------------------------
// ATIS: a candlestick chart drawing itself, bar by bar.
export function candles(ctx: SceneCtx): SceneDef {
  const { theme } = ctx;
  const s = stage(30);
  const rand = rng(77);
  const COUNT = 18;
  const bodies: Group[] = [];
  let price = 0;
  for (let i = 0; i < COUNT; i++) {
    const open = price;
    const close = open + (rand() - 0.46) * 0.5;
    const high = Math.max(open, close) + rand() * 0.22;
    const low = Math.min(open, close) - rand() * 0.22;
    price = close;
    const up = close >= open;
    const candle = new Group();
    const wick = new Mesh(new BoxGeometry(0.022, high - low, 0.022), flat(theme.ink, 0.8));
    wick.position.y = (high + low) / 2;
    const body = new Mesh(new BoxGeometry(0.13, Math.max(0.03, Math.abs(close - open)), 0.13), solid(up ? theme.good : theme.accent));
    body.position.y = (open + close) / 2;
    candle.add(wick, body);
    candle.position.x = (i - (COUNT - 1) / 2) * 0.2;
    s.root.add(candle);
    bodies.push(candle);
  }
  s.root.position.y = -price / 2;
  return {
    scene: s.scene,
    camera: s.camera,
    resize: (w, h) => frame(s, w, h, 4.4, 5.2, 0.3),
    update(time, _dt, pointer) {
      const shown = ctx.reduced ? COUNT : ((time * 3.2) % (COUNT + 9)) + 1; // draw in, hold, start again
      bodies.forEach((c, i) => {
        const k = clamp01(shown - i);
        c.scale.set(1, Math.max(0.0001, easeOutBack(k)), 1);
        c.visible = k > 0;
      });
      s.root.rotation.y = -0.34 + pointer.x * 0.4;
      s.root.rotation.x = 0.12 + pointer.y * 0.14;
    },
    dispose: () => disposeScene(s.scene),
  };
}

// ---------------------------------------------------------------------------
// Agentic Workflow Builder: a chain of steps, each handing its result to the next.
export function graph(ctx: SceneCtx): SceneDef {
  const { theme } = ctx;
  const s = stage(30);
  const spots: Array<[number, number, number]> = [
    [-1.9, 0.35, 0],
    [-0.95, -0.3, 0.4],
    [0, 0.4, -0.3],
    [0.95, -0.25, 0.35],
    [1.9, 0.3, 0],
  ];
  const nodes = spots.map((p) => {
    const mat = solid(theme.paper2);
    mat.color = new Color().copy(theme.paper2); // each node gets its own colour so it can light up
    const node = new Mesh(new BoxGeometry(0.5, 0.36, 0.36), mat);
    node.position.set(p[0], p[1], p[2]);
    outline(node, theme.ink, 0.9);
    s.root.add(node);
    return node;
  });
  const path: number[] = [];
  spots.forEach((p) => path.push(p[0], p[1], p[2]));
  const lineGeo = new BufferGeometry();
  lineGeo.setAttribute('position', new BufferAttribute(new Float32Array(path), 3));
  s.root.add(new Line(lineGeo, lineMat(theme.ink, 0.45)));
  const token = new Mesh(new SphereGeometry(0.085, 14, 10), flat(theme.accent));
  s.root.add(token);
  const HOP = 0.9;
  return {
    scene: s.scene,
    camera: s.camera,
    resize: (w, h) => frame(s, w, h, 6.0, 5.6),
    update(time, _dt, pointer) {
      const t = ctx.reduced ? HOP * 2.5 : time % (HOP * (spots.length + 1.5));
      const at = Math.min(spots.length - 1, t / HOP);
      const i = Math.min(spots.length - 2, Math.floor(at));
      const f = smooth(0.15, 0.85, at - i);
      const a = spots[i];
      const b = spots[i + 1];
      token.position.set(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f + Math.sin(f * Math.PI) * 0.16, a[2] + (b[2] - a[2]) * f);
      token.visible = at < spots.length - 1 + 0.001;
      nodes.forEach((node, n) => {
        const done = clamp01(at - n + 0.15); // a step is done once the token has left it
        (node.material as MeshLambertMaterial).color.copy(theme.paper2).lerp(theme.good, done * 0.85);
        node.scale.setScalar(1 + 0.16 * Math.sin(clamp01((at - n + 0.25) * 2.2) * Math.PI));
      });
      s.root.rotation.y = -0.25 + pointer.x * 0.4;
      s.root.rotation.x = 0.22 + pointer.y * 0.16;
    },
    dispose: () => disposeScene(s.scene),
  };
}

// ---------------------------------------------------------------------------
// Contact: a paper plane on a lazy loop, trailing dots.
export function plane(ctx: SceneCtx): SceneDef {
  const { theme } = ctx;
  const s = stage(34);
  // This sits on the inverted (ink-coloured) block, so the paper tone is the one that shows.
  const v = [
    [1.1, 0, 0], // 0 nose
    [-0.9, 0.16, 0.8], // 1 left wing tip
    [-0.9, 0.16, -0.8], // 2 right wing tip
    [-0.9, 0.02, 0.1], // 3 left fold
    [-0.9, 0.02, -0.1], // 4 right fold
    [-0.9, -0.42, 0], // 5 keel
  ];
  const tri = [0, 1, 3, 0, 4, 2, 0, 3, 5, 0, 5, 4];
  const pos: number[] = [];
  tri.forEach((i) => pos.push(v[i][0], v[i][1], v[i][2]));
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  geo.computeVertexNormals();
  const craft = new Mesh(geo, solid(theme.paper, DoubleSide));
  craft.scale.setScalar(0.42);
  outline(craft, theme.accent, 1, 1);
  s.root.add(craft);

  const TRAIL = 46;
  const dots = dotGeometry(TRAIL);
  (dots.geometry.attributes.position as BufferAttribute).setUsage(DynamicDrawUsage);
  const dotMat = dotMaterial(theme);
  const trail = new Points(dots.geometry, dotMat);
  trail.frustumCulled = false;
  s.root.add(trail);
  for (let i = 0; i < TRAIL; i++) {
    dots.mix[i * 2] = 1;
    dots.size[i] = 0.05;
    dots.alpha[i] = (1 - i / TRAIL) * 0.85;
  }
  const at = (t: number, out: Vector3) => out.set(Math.sin(t * 0.55) * 2.5, Math.sin(t * 1.1) * 0.55 + 0.1, Math.cos(t * 0.55) * 1.3);
  const here = new Vector3();
  const ahead = new Vector3();
  const p = new Vector3();
  return {
    scene: s.scene,
    camera: s.camera,
    resize(w, h, ratio) {
      frame(s, w, h, 6.4, 6.4, 0.4, 0);
      dotMat.uniforms.uScale.value = dotScale(h, ratio, s.fov);
    },
    update(time, _dt, pointer) {
      const t = ctx.reduced ? 1.2 : time;
      at(t, here);
      at(t + 0.06, ahead);
      craft.position.copy(here);
      craft.lookAt(ahead);
      craft.rotateY(-Math.PI / 2); // the model's nose points along +x
      craft.rotateX(Math.cos(t * 0.55) * 0.5); // bank into the turn
      for (let i = 0; i < TRAIL; i++) {
        at(t - 0.12 - i * 0.075, p);
        dots.position[i * 3] = p.x;
        dots.position[i * 3 + 1] = p.y;
        dots.position[i * 3 + 2] = p.z;
      }
      dots.geometry.attributes.position.needsUpdate = true;
      s.root.rotation.y = pointer.x * 0.25;
      s.root.rotation.x = 0.1 + pointer.y * 0.12;
    },
    dispose: () => disposeScene(s.scene),
  };
}

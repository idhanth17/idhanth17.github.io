import {
  BufferAttribute,
  BufferGeometry,
  DynamicDrawUsage,
  Group,
  LineLoop,
  LineSegments,
  Mesh,
  PerspectiveCamera,
  Points,
  Scene,
  SphereGeometry,
} from 'three';
import type { SceneCtx, SceneDef } from './engine';
import { clamp01, disposeScene, dotGeometry, dotMaterial, dotScale, flat, lineMat, rng, smooth } from './kit';

// Retrieval, drawn in 3D: every dot is one document in a corpus, placed as if in
// an embedding space (similar documents cluster). A query lands, and the nearest
// documents light up. The number of dots is the real size of the corpus.

export interface CorpusOpts {
  count: number;
}

const K = 8; // neighbours shown per query
const CYCLE = 3.6;

export function corpus(ctx: SceneCtx, opts: CorpusOpts): SceneDef {
  const { theme } = ctx;
  const N = Math.max(400, Math.min(60000, Math.round(opts.count) || 20000));
  const FOV = 36;
  const rand = rng(20177);

  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, 1, 0.1, 40);
  const cloud = new Group();
  scene.add(cloud);

  // Documents gather into topics: a handful of soft clusters inside a ball.
  const gauss = () => (rand() + rand() + rand() + rand() - 2) * 0.9;
  const centres: Array<[number, number, number, number]> = [];
  for (let c = 0; c < 18; c++) {
    const u = rand() * 2 - 1;
    const th = rand() * Math.PI * 2;
    const r = 1.55 * Math.cbrt(rand());
    const s = Math.sqrt(1 - u * u);
    centres.push([r * s * Math.cos(th), r * u * 0.8, r * s * Math.sin(th), 0.3 + rand() * 0.42]);
  }
  const dots = dotGeometry(N);
  for (let i = 0; i < N; i++) {
    const c = centres[Math.floor(rand() * rand() * centres.length)];
    dots.position[i * 3] = c[0] + gauss() * c[3];
    dots.position[i * 3 + 1] = c[1] + gauss() * c[3];
    dots.position[i * 3 + 2] = c[2] + gauss() * c[3];
    dots.alpha[i] = 0.15 + rand() * 0.2;
    dots.size[i] = 0.013 + rand() * 0.01;
  }
  // Centre the cloud on its own middle, so it sits squarely in its frame.
  const mid = [0, 0, 0];
  for (let i = 0; i < N * 3; i++) mid[i % 3] += dots.position[i] / N;
  for (let i = 0; i < N * 3; i++) dots.position[i] -= mid[i % 3];
  (dots.geometry.attributes.aMix as BufferAttribute).setUsage(DynamicDrawUsage);
  const dotMat = dotMaterial(theme, 3.2);
  const points = new Points(dots.geometry, dotMat);
  points.frustumCulled = false;
  cloud.add(points);

  // The query: a solid dot, a ring that pulses out from it, and lines to its neighbours.
  const query = new Mesh(new SphereGeometry(0.055, 16, 12), flat(theme.accent));
  cloud.add(query);
  const circle: number[] = [];
  for (let i = 0; i < 48; i++) circle.push(Math.cos((i / 48) * Math.PI * 2), Math.sin((i / 48) * Math.PI * 2), 0);
  const pulseGeo = new BufferGeometry();
  pulseGeo.setAttribute('position', new BufferAttribute(new Float32Array(circle), 3));
  const pulse = new LineLoop(pulseGeo, lineMat(theme.accent, 0.8));
  cloud.add(pulse);

  const linkPos = new Float32Array(K * 6);
  const linkGeo = new BufferGeometry();
  linkGeo.setAttribute('position', new BufferAttribute(linkPos, 3).setUsage(DynamicDrawUsage));
  const links = new LineSegments(linkGeo, lineMat(theme.accent, 0.9));
  links.frustumCulled = false;
  cloud.add(links);

  const nearest = new Int32Array(K);
  const best = new Float32Array(K);
  let qx = 0;
  let qy = 0;
  let qz = 0;

  const ask = () => {
    for (const i of nearest) dots.mix[i * 2] = 0;
    // Ask about something the corpus actually covers: start from a random document.
    const from = Math.floor(Math.random() * N) * 3;
    qx = dots.position[from] + (Math.random() - 0.5) * 0.12;
    qy = dots.position[from + 1] + (Math.random() - 0.5) * 0.12;
    qz = dots.position[from + 2] + (Math.random() - 0.5) * 0.12;
    best.fill(Infinity);
    nearest.fill(0);
    for (let i = 0; i < N; i++) {
      const dx = dots.position[i * 3] - qx;
      const dy = dots.position[i * 3 + 1] - qy;
      const dz = dots.position[i * 3 + 2] - qz;
      const d = dx * dx + dy * dy + dz * dz;
      if (d >= best[K - 1]) continue;
      let j = K - 1;
      while (j > 0 && best[j - 1] > d) {
        best[j] = best[j - 1];
        nearest[j] = nearest[j - 1];
        j--;
      }
      best[j] = d;
      nearest[j] = i;
    }
    query.position.set(qx, qy, qz);
    pulse.position.set(qx, qy, qz);
  };

  let lastGlow = -1;
  let clock = ctx.reduced ? 1.4 : 0;
  ask();

  return {
    scene,
    camera,
    resize(width, height, pixelRatio) {
      const aspect = width / height;
      camera.position.set(0, 0, Math.max(6.1, 5.2 / (2 * Math.tan((FOV * Math.PI) / 360) * aspect)));
      camera.lookAt(0, 0, 0);
      dotMat.uniforms.uScale.value = dotScale(height, pixelRatio, FOV);
    },
    update(time, dt, pointer) {
      clock += dt;
      if (clock > CYCLE) {
        clock -= CYCLE;
        ask();
      }
      const reach = smooth(0, 0.55, clock); // lines growing out to the neighbours
      const fade = 1 - smooth(2.5, 3.2, clock);
      const glow = reach * fade;
      for (let n = 0; n < K; n++) {
        const i = nearest[n];
        dots.mix[i * 2] = glow;
        const tx = dots.position[i * 3];
        const ty = dots.position[i * 3 + 1];
        const tz = dots.position[i * 3 + 2];
        linkPos[n * 6] = qx;
        linkPos[n * 6 + 1] = qy;
        linkPos[n * 6 + 2] = qz;
        linkPos[n * 6 + 3] = qx + (tx - qx) * reach;
        linkPos[n * 6 + 4] = qy + (ty - qy) * reach;
        linkPos[n * 6 + 5] = qz + (tz - qz) * reach;
      }
      // Only re-send the colours while the highlight is actually changing.
      if (glow !== lastGlow) {
        lastGlow = glow;
        dots.geometry.attributes.aMix.needsUpdate = true;
      }
      linkGeo.attributes.position.needsUpdate = true;
      links.material.opacity = 0.9 * fade;
      query.scale.setScalar(Math.max(0.001, fade * (0.6 + 0.4 * reach)));

      const ring = clamp01(clock / 1.3);
      pulse.scale.setScalar(0.06 + ring * 0.42);
      pulse.material.opacity = (1 - ring) * 0.85 * fade;
      pulse.quaternion.copy(cloud.quaternion).invert().multiply(camera.quaternion); // always face the viewer

      cloud.rotation.y = (ctx.reduced ? 0.6 : time * 0.085) + pointer.x * 0.35;
      cloud.rotation.x = 0.22 + pointer.y * 0.18;
    },
    dispose() {
      disposeScene(scene);
    },
  };
}

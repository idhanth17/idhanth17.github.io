import { bottleneck } from './bottleneck';
import { corpus } from './corpus';
import { anvil, candles, graph, lottery, plane, rings, waveform } from './emblems';
import { getEngine, type Handle, type SceneCtx, type SceneDef } from './engine';
import { fleet } from './fleet';

// Everything 3D lives behind this one entry point, so the page can load it lazily
// (after the text has already been painted) as a single separate chunk.

type Factory = (ctx: SceneCtx, opts: never) => SceneDef;

const SCENES: Record<string, Factory> = {
  bottleneck: bottleneck as Factory,
  corpus: corpus as Factory,
  fleet: fleet as Factory,
  waveform,
  lottery,
  rings,
  anvil,
  candles,
  graph,
  plane,
};

export const sceneNames = Object.keys(SCENES);

/** Start a named scene on a canvas. Returns null when 3D is unavailable (the still fallback stays). */
export function mountScene(canvas: HTMLCanvasElement, name: string, opts: unknown, direct: boolean): Handle | null {
  const factory = SCENES[name];
  if (!factory) return null;
  return getEngine().mount(canvas, factory as (ctx: SceneCtx, opts: unknown) => SceneDef, opts, direct);
}

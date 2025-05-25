// ==================== data/mockWorld.ts ====================
import {
  World,
  TileRegion,
  TileBlock,
  PathLayer,
  RenderLayer,
  Promiser,
  BehaviorLoop,
  Action,
  MoveDirection,
} from '@/types/promiser';

export const randomWalker: BehaviorLoop = {
  evaluate: () => {
    const dirs: MoveDirection[] = ['north', 'south', 'east', 'west'];
    return {
      type: 'move',
      direction: dirs[Math.floor(Math.random() * dirs.length)],
    } as Action;
  },
};

// Simple 10×6 ground map
const groundRegion: TileRegion = {
  id: 'ground-region',
  origin: { x: 0, y: 0 },
  width: 10,
  height: 6,
  tiles: Array.from({ length: 10 * 6 }).map((_, i) => {
    const x = i % 10;
    const y = Math.floor(i / 10);
    return {
      id: `tile-${x}-${y}`,
      position: { x, y },
      type: 'ground',
      spriteId: 'ground',
      walkable: true,
    } as TileBlock;
  }),
};

const groundLayer: PathLayer = {
  id: 'ground-layer',
  bounds: { x: 0, y: 0, width: 10, height: 1 },
  zIndex: 5,
  type: 'ground',
  walkable: true,
};

const bgLayer: RenderLayer = {
  id: 'sky',
  zIndex: 0,
  parallax: 0.5,
  sprites: [],
};

// One Promiser at (2,0)
const promiser: Promiser = {
  id: 'p1',
  name: 'Pixel',
  spriteId: 'pixel',
  position: { x: 2, y: 0, facing: 'right' },
  state: { mood: 'serene', energy: 100 },
  memory: [],
  installedPromises: [],
  behaviorLoop: randomWalker,
};

export const initialWorld: World = {
  width: 10,
  height: 6,
  tileRegions: [groundRegion],
  pathLayers: [groundLayer],
  renderLayers: [bgLayer],
  triggerZones: [],
  promisers: [promiser],
  camera: { x: 0, y: 0, width: 10, height: 6 },
};

// ==================== components/MachiScene.tsx ====================
import { useState } from 'react';
import { initialWorld } from '@/data/mockWorld';
import { usePromiserWorker } from '@/hooks/usePromiserWorker';
import { TILE_SIZE, World } from '@/types/promiser';

export default function MachiScene() {
  const [world, setWorld] = useState<World>(initialWorld);
  const [promisers, setPromisers] = useState(world.promisers);

  usePromiserWorker(world, setPromisers);

  return (
    <div
      style={{
        position: 'relative',
        width: world.camera.width * TILE_SIZE,
        height: world.camera.height * TILE_SIZE,
        border: '1px solid #000',
      }}
    >
      {promisers.map((p) => (
        <div
          key={p.id}
          style={{
            position: 'absolute',
            left: (p.position.x - world.camera.x) * TILE_SIZE,
            bottom: (p.position.y - world.camera.y) * TILE_SIZE,
            width: TILE_SIZE,
            height: TILE_SIZE,
            backgroundColor: 'red',
          }}
          title={p.name}
        />
      ))}
    </div>
  );
}

// ==================== pages/index.tsx ====================
export { default } from '@/components/MachiScene';

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

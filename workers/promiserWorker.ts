import { World, Promiser } from '@/types/promiser';
import { TILE_SIZE } from '@/types/promiser';

self.onmessage = (e: MessageEvent<{ world: World }>) => {
  const { world } = e.data;

  const updated: Promiser[] = world.promisers.map((p) => {
    const action = p.behaviorLoop.evaluate(p, world);
    if (action?.type === 'move' && action.direction) {
      switch (action.direction) {
        case 'north':
          p.position.y += 1;
          break;
        case 'south':
          p.position.y -= 1;
          break;
        case 'east':
          p.position.x += 1;
          p.position.facing = 'right';
          break;
        case 'west':
          p.position.x -= 1;
          p.position.facing = 'left';
          break;
      }
    }
    return p;
  });

  (self as any).postMessage({ promisers: updated });
};

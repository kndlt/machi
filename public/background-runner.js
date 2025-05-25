
// public/machi-worker.js

self.onmessage = (e) => {
    const { world } = e.data;
  
    const updated = world.promisers.map((p) => {
      const action = p.behaviorLoop?.evaluate?.(p, world);
      if (action?.type === 'move') {
        switch (action.direction) {
          case 'north': p.position.y += 1; break;
          case 'south': p.position.y -= 1; break;
          case 'east':  p.position.x += 1; p.position.facing = 'right'; break;
          case 'west':  p.position.x -= 1; p.position.facing = 'left'; break;
        }
      }
      return p;
    });
  
    self.postMessage({ promisers: updated });
  };
  
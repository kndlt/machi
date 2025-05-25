'use client'
import { useEffect, useRef } from 'react';
import * as PIXI from 'pixi.js';
import { Assets } from 'pixi.js';
import { Sprite } from 'pixi.js';

export default function WorldCanvas() {
    const canvasRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const app = new PIXI.Application();
        const init = async () => {
            await app.init({
            resizeTo: window,
            backgroundColor: 0x111111,
            antialias: true,
            });
            canvasRef.current?.appendChild(app.canvas);
            const texture = await Assets.load('/sprites/test_sprite.png');
            const sprite = new PIXI.Sprite(texture);
            sprite.anchor.set(0.5);
            sprite.x = window.innerWidth / 2;
            sprite.y = window.innerHeight / 2;
            app.stage.addChild(sprite);
            app.ticker.add(() => {
                sprite.rotation += 0.01;
            });
        }
        init();
        return () => app.destroy(true, { children: true });
    }, []);
    
  return <div className="w-full h-screen" ref={canvasRef} />;
}

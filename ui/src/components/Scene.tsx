import type { MouseEventHandler } from "react";
import { tileMapStore } from "../states/tileMapStore";

export function Scene() {
    const tileMap = tileMapStore.tileMap.value;
    const width = tileMap?.width || 0;

    const onTileClick: MouseEventHandler = (evt) => {
        console.log("Scene clicked");
        // update to dirt tile
        const target = evt.target as HTMLElement;
        const index = Array.from(target.parentElement!.children).indexOf(target);
        console.log("Tile index:", index);
        if (tileMap) {
            tileMap.tiles[index] = { matter: "dirt" };
            tileMapStore.tileMap.value = { ...tileMap };
        }
    };

    return (
        <div className="scene" css={{
            display: "grid",
            gridTemplateColumns: `repeat(${width}, 32px)`,
            gridTemplateRows: `repeat(${tileMap?.height || 0}, 32px)`,
        }}>
            {tileMap?.tiles.map((tile, index) => (
                <div 
                    key={index} 
                    className="tile" 
                    onClick={onTileClick}
                    css={{
                    width: 32,
                    height: 32,
                    ...(tile ? { backgroundColor: "#654321" } : { backgroundColor: "#ccc" }),
                }} />
            ))}
        </div>
    );
}
import { useEffect } from "react";
import { Theme } from "@radix-ui/themes";
import { Scene } from "./components/Scene";
import { Toolbar } from "./components/Toolbar";
import { Inspector } from "./components/Inspector";
import { tileMapStore } from "./states/tileMapStore";

let initPromise: Promise<void> | undefined;

async function initApp() {
  console.log("Initializing app...");
  tileMapStore.initTileMapStore();
}

export default function App() {
  useEffect(() => {
    if (!initPromise) {
      initPromise = initApp();
    }
  }, []);

  return (
    <Theme
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "row",
        overflow: "hidden",
      }}
    >
      <Toolbar />
      <Scene />
      <Inspector />
    </Theme>
  );
}
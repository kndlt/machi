import { useEffect } from "react";
import { Theme } from "@radix-ui/themes";
import { Scene } from "./components/Scene";
import { Toolbar } from "./components/Toolbar";
import { Inspector } from "./components/Inspector";
import { StatusBar } from "./components/StatusBar";
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
      appearance="dark"
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", flexDirection: "row", flex: 1, minHeight: 0 }}>
        <Toolbar />
        <Scene />
        <Inspector />
      </div>
      <StatusBar />
    </Theme>
  );
}
import { useEffect } from "react";
import { Theme } from "@radix-ui/themes";
import { Scene } from "./components/Scene";
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
      // appearance="dark"
      css={{
        minHeight: "100%",
        maxHeight: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column"
      }}
    >
      <Scene />
    </Theme>
  );
}
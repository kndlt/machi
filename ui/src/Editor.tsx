import { useEffect } from "react";
import { Theme } from "@radix-ui/themes";
import { useSignals } from "@preact/signals-react/runtime";
import { Scene } from "./components/Scene";
import { Toolbar } from "./components/Toolbar";
import { Inspector } from "./components/Inspector";
import { StatusBar } from "./components/StatusBar";
import { MenuBar } from "./components/MenuBar";
import { FileBrowser, SaveAsDialog } from "./components/FileBrowser";
import { tileMapStore } from "./states/tileMapStore";
import { editorStore } from "./states/editorStore";

let initPromise: Promise<void> | undefined;

async function initApp() {
  console.log("Initializing app...");
  tileMapStore.initTileMapStore();
}

export default function Editor() {
  console.log("[render] App");
  useSignals();

  useEffect(() => {
    if (!initPromise) {
      initPromise = initApp();
    }
  }, []);

  const dialog = editorStore.activeDialog.value;
  const closeDialog = () => {
    editorStore.activeDialog.value = null;
  };

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
      <MenuBar />
      <div css={{ display: "flex", flexDirection: "row", flex: 1, minHeight: 0 }}>
        <Toolbar />
        <Scene />
        <Inspector />
      </div>
      <StatusBar />
      {dialog === "fileBrowser" && <FileBrowser onClose={closeDialog} />}
      {dialog === "saveAs" && <SaveAsDialog onClose={closeDialog} />}
    </Theme>
  );
}
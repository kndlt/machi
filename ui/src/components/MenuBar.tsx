import { DropdownMenu } from "radix-ui";
import { useSignals } from "@preact/signals-react/runtime";
import { editorStore } from "../states/editorStore";
import { tileMapStore } from "../states/tileMapStore";
import { autosave, saveFile } from "../states/persistence";

export function MenuBar() {
    useSignals();

    const handleSave = () => {
        if (tileMapStore.currentFileId.value) {
            const tm = tileMapStore.tileMap.value;
            if (tm) {
                autosave(tm);
                saveFile(tm, tileMapStore.currentFileId.value!);
            }
        } else {
            editorStore.activeDialog.value = "saveAs";
        }
    };

    return (
        <div
            style={{
                height: 32,
                // backgroundColor: "var(--color-panel-solid)",
                borderBottom: "1px solid var(--gray-a5)",
                display: "flex",
                alignItems: "center",
                padding: "0 4px",
                gap: 0,
                flexShrink: 0,
            }}
        >
            <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                    <button>File</button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                    <DropdownMenu.Content sideOffset={2} >
                        <MenuItem
                            label="New"
                            shortcut="⌘N"
                            onClick={() => tileMapStore.newFile()}
                        />
                        <MenuItem
                            label="Open…"
                            shortcut="⌘O"
                            onClick={() => { editorStore.activeDialog.value = "fileBrowser"; }}
                        />
                        <DropdownMenu.Separator />
                        <MenuItem
                            label="Save"
                            shortcut="⌘S"
                            onClick={handleSave}
                        />
                        <MenuItem
                            label="Save As…"
                            shortcut="⌘⇧S"
                            onClick={() => { editorStore.activeDialog.value = "saveAs"; }}
                        />
                    </DropdownMenu.Content>
                </DropdownMenu.Portal>
            </DropdownMenu.Root>
        </div>
    );
}

function MenuItem({
    label,
    shortcut,
    onClick,
}: {
    label: string;
    shortcut?: string;
    onClick: () => void;
}) {
    return (
        <DropdownMenu.Item onClick={onClick}>
            <span>{label}</span>
            {shortcut && <span>{shortcut}</span>}
        </DropdownMenu.Item>
    );
}

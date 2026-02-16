import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
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
                backgroundColor: "var(--color-panel)",
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
                    <button style={triggerStyle}>File</button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                    <DropdownMenu.Content sideOffset={2} style={contentStyle}>
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
                        <DropdownMenu.Separator style={separatorStyle} />
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
        <DropdownMenu.Item style={itemStyle} onClick={onClick}>
            <span>{label}</span>
            {shortcut && <span style={shortcutStyle}>{shortcut}</span>}
        </DropdownMenu.Item>
    );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const triggerStyle: React.CSSProperties = {
    background: "none",
    border: "none",
    color: "var(--gray-11)",
    fontSize: 12,
    fontWeight: 500,
    padding: "4px 10px",
    borderRadius: 4,
    cursor: "pointer",
    lineHeight: 1,
};

const contentStyle: React.CSSProperties = {
    backgroundColor: "var(--color-panel)",
    border: "1px solid var(--gray-a5)",
    borderRadius: 6,
    padding: "4px 0",
    minWidth: 180,
    boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
    zIndex: 1001,
};

const itemStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "6px 12px",
    fontSize: 12,
    color: "var(--gray-12)",
    cursor: "pointer",
    outline: "none",
    borderRadius: 0,
};

const shortcutStyle: React.CSSProperties = {
    color: "var(--gray-8)",
    fontSize: 11,
    marginLeft: 24,
};

const separatorStyle: React.CSSProperties = {
    height: 1,
    backgroundColor: "var(--gray-a5)",
    margin: "4px 0",
};

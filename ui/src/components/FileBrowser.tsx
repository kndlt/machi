import { useState } from "react";
import { useSignals } from "@preact/signals-react/runtime";
import { Cross2Icon } from "@radix-ui/react-icons";
import { tileMapStore } from "../states/tileMapStore";

export function FileBrowser({ onClose }: { onClose: () => void }) {
    useSignals();
    const files = tileMapStore.savedFiles.value;
    const currentId = tileMapStore.currentFileId.value;
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

    return (
        <div
            style={{
                position: "fixed",
                inset: 0,
                zIndex: 1000,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
            }}
        >
            {/* Backdrop */}
            <div
                onClick={onClose}
                style={{
                    position: "absolute",
                    inset: 0,
                    backgroundColor: "rgba(0,0,0,0.6)",
                }}
            />

            {/* Panel */}
            <div
                style={{
                    position: "relative",
                    width: 420,
                    maxHeight: "70vh",
                    backgroundColor: "var(--color-panel-solid)",
                    border: "1px solid var(--gray-a5)",
                    borderRadius: 8,
                    display: "flex",
                    flexDirection: "column",
                    overflow: "hidden",
                }}
            >
                {/* Header */}
                <div
                    style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "12px 16px",
                        borderBottom: "1px solid var(--gray-a5)",
                    }}
                >
                    <span style={{ fontWeight: 600, fontSize: 13, color: "var(--gray-12)" }}>
                        Saved Maps
                    </span>
                    <button onClick={onClose} style={closeBtnStyle}>
                        <Cross2Icon />
                    </button>
                </div>

                {/* List */}
                <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
                    {files.length === 0 && (
                        <div style={{ padding: "24px 16px", color: "var(--gray-8)", fontSize: 12, textAlign: "center" }}>
                            No saved maps yet. Use Save As to create one.
                        </div>
                    )}
                    {files.map((f) => (
                        <div
                            key={f.id}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                padding: "8px 16px",
                                backgroundColor:
                                    f.id === currentId ? "var(--gray-a3)" : "transparent",
                                cursor: "pointer",
                            }}
                            onClick={() => {
                                tileMapStore.openFile(f.id);
                                onClose();
                            }}
                        >
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div
                                    style={{
                                        fontSize: 12,
                                        fontWeight: 500,
                                        color: "var(--gray-12)",
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap",
                                    }}
                                >
                                    {f.name}
                                    {f.id === currentId && (
                                        <span style={{ color: "var(--gray-8)", fontWeight: 400 }}>
                                            {" "}
                                            (current)
                                        </span>
                                    )}
                                </div>
                                <div style={{ fontSize: 10, color: "var(--gray-8)", marginTop: 2 }}>
                                    {f.width}×{f.height} · {new Date(f.updatedAt).toLocaleString()}
                                </div>
                            </div>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (confirmDelete === f.id) {
                                        tileMapStore.deleteFileById(f.id);
                                        setConfirmDelete(null);
                                    } else {
                                        setConfirmDelete(f.id);
                                    }
                                }}
                                onBlur={() => setConfirmDelete(null)}
                                style={{
                                    ...actionBtnStyle,
                                    color: confirmDelete === f.id ? "var(--red-9)" : "var(--gray-9)",
                                }}
                                title={confirmDelete === f.id ? "Click again to confirm" : "Delete"}
                            >
                                {confirmDelete === f.id ? "Confirm?" : "🗑"}
                            </button>
                        </div>
                    ))}
                </div>

                {/* Footer */}
                <div
                    style={{
                        display: "flex",
                        gap: 8,
                        padding: "10px 16px",
                        borderTop: "1px solid var(--gray-a5)",
                        justifyContent: "flex-end",
                    }}
                >
                    <button
                        onClick={() => {
                            tileMapStore.newFile();
                            onClose();
                        }}
                        style={footerBtnStyle}
                    >
                        New Map
                    </button>
                    <button onClick={onClose} style={footerBtnStyle}>
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Save-As prompt ─────────────────────────────────────────────────────────

export function SaveAsDialog({ onClose }: { onClose: () => void }) {
    useSignals();
    const currentName = tileMapStore.tileMap.value?.name ?? "Untitled";
    const [name, setName] = useState(currentName);

    const handleSave = () => {
        const trimmed = name.trim();
        if (!trimmed) return;
        tileMapStore.saveAs(trimmed);
        onClose();
    };

    return (
        <div
            style={{
                position: "fixed",
                inset: 0,
                zIndex: 1000,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
            }}
        >
            <div
                onClick={onClose}
                style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.6)" }}
            />
            <div
                style={{
                    position: "relative",
                    width: 320,
                    backgroundColor: "var(--color-panel-solid)",
                    border: "1px solid var(--gray-a5)",
                    borderRadius: 8,
                    padding: 20,
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                }}
            >
                <div style={{ fontWeight: 600, fontSize: 13, color: "var(--gray-12)" }}>Save As</div>
                <input
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") handleSave();
                        if (e.key === "Escape") onClose();
                    }}
                    placeholder="Map name"
                    style={{
                        padding: "6px 10px",
                        fontSize: 13,
                        backgroundColor: "var(--gray-a3)",
                        color: "var(--gray-12)",
                        border: "1px solid var(--gray-a5)",
                        borderRadius: 4,
                        outline: "none",
                    }}
                />
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button onClick={onClose} style={footerBtnStyle}>
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        style={{ ...footerBtnStyle, backgroundColor: "var(--gray-a4)" }}
                    >
                        Save
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Shared styles ──────────────────────────────────────────────────────────

const closeBtnStyle: React.CSSProperties = {
    background: "none",
    border: "none",
    color: "var(--gray-9)",
    cursor: "pointer",
    fontSize: 14,
    padding: 4,
};

const actionBtnStyle: React.CSSProperties = {
    background: "none",
    border: "none",
    cursor: "pointer",
    fontSize: 12,
    padding: "4px 6px",
    borderRadius: 4,
    flexShrink: 0,
};

const footerBtnStyle: React.CSSProperties = {
    background: "none",
    border: "1px solid var(--gray-a5)",
    borderRadius: 4,
    color: "var(--gray-11)",
    cursor: "pointer",
    fontSize: 12,
    padding: "5px 12px",
};

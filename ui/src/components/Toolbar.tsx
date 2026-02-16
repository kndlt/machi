import { useSignals } from "@preact/signals-react/runtime";
import { editorStore, type Tool } from "../states/editorStore";

const TOOLS: { id: Tool; icon: string; label: string }[] = [
    { id: "pencil", icon: "✏️", label: "Pencil (P)" },
    { id: "eraser", icon: "🧹", label: "Eraser (E)" },
    { id: "bucket", icon: "🪣", label: "Bucket Fill (G)" },
];

export function Toolbar() {
    useSignals();
    const active = editorStore.activeTool.value;

    return (
        <div
            style={{
                width: 52,
                backgroundColor: "var(--color-panel)",
                borderRight: "1px solid var(--gray-a5)",
                display: "flex",
                flexDirection: "column",
                padding: "8px 4px",
                gap: 4,
            }}
        >
            {TOOLS.map((t) => (
                <ToolButton
                    key={t.id}
                    icon={t.icon}
                    label={t.label}
                    active={active === t.id}
                    onClick={() => {
                        editorStore.activeTool.value = t.id;
                    }}
                />
            ))}
        </div>
    );
}

function ToolButton({
    icon,
    label,
    active,
    onClick,
}: {
    icon: string;
    label: string;
    active: boolean;
    onClick: () => void;
}) {
    return (
        <button
            onClick={onClick}
            title={label}
            style={{
                width: 44,
                height: 44,
                backgroundColor: active ? "var(--accent-a4)" : "var(--gray-a3)",
                border: active ? "1px solid var(--accent-a7)" : "1px solid var(--gray-a5)",
                borderRadius: 4,
                fontSize: 20,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "background-color 0.1s",
            }}
            onMouseEnter={(e) => {
                if (!active) e.currentTarget.style.backgroundColor = "var(--gray-a4)";
            }}
            onMouseLeave={(e) => {
                if (!active) e.currentTarget.style.backgroundColor = "var(--gray-a3)";
            }}
        >
            {icon}
        </button>
    );
}

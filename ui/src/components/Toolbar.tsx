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
                backgroundColor: "#1e1e1e",
                borderRight: "1px solid #3e3e3e",
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
                backgroundColor: active ? "#094771" : "#2d2d2d",
                border: active ? "1px solid #0e639c" : "1px solid #3e3e3e",
                borderRadius: 4,
                fontSize: 20,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "background-color 0.1s",
            }}
            onMouseEnter={(e) => {
                if (!active) e.currentTarget.style.backgroundColor = "#383838";
            }}
            onMouseLeave={(e) => {
                if (!active) e.currentTarget.style.backgroundColor = "#2d2d2d";
            }}
        >
            {icon}
        </button>
    );
}

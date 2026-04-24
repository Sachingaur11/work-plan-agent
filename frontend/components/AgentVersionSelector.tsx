"use client";

interface Props {
  /** Sorted list of version numbers the admin has enabled (e.g. [1, 2, 3]) */
  availableVersions: number[];
  /** Currently selected version, or null = use default (latest) */
  selectedVersion: number | null;
  onSelect: (version: number | null) => void;
  /** Total slots shown in the UI — always MAX_VERSIONS from the backend */
  maxVersions?: number;
  disabled?: boolean;
}

export default function AgentVersionSelector({
  availableVersions,
  selectedVersion,
  onSelect,
  maxVersions = 5,
  disabled = false,
}: Props) {
  const slots = Array.from({ length: maxVersions }, (_, i) => i + 1);

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-slate-400 font-medium mr-0.5 whitespace-nowrap">Agent ver.</span>

      {/* "Default" pill — no pinning */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => onSelect(null)}
        title="Use default (latest) version"
        className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
          selectedVersion === null
            ? "bg-slate-700 text-white shadow-sm"
            : "bg-slate-100 text-slate-500 hover:bg-slate-200"
        } disabled:opacity-40 disabled:cursor-not-allowed`}
      >
        Default
      </button>

      {/* V1 – V{maxVersions} */}
      {slots.map((v) => {
        const isAvailable = availableVersions.includes(v);
        const isSelected = selectedVersion === v;

        return (
          <button
            key={v}
            type="button"
            disabled={disabled || !isAvailable}
            onClick={() => onSelect(isSelected ? null : v)}
            title={
              isAvailable
                ? `Pin to agent version ${v}`
                : `Version ${v} not yet published`
            }
            className={`
              px-2.5 py-1 rounded-lg text-xs font-semibold transition relative
              ${isAvailable
                ? isSelected
                  ? "bg-indigo-600 text-white shadow-sm ring-2 ring-indigo-400 ring-offset-1"
                  : "bg-indigo-100 text-indigo-700 hover:bg-indigo-200"
                : "bg-slate-100 text-slate-300 cursor-not-allowed"
              }
              disabled:cursor-not-allowed
            `}
          >
            V{v}
            {isAvailable && !isSelected && (
              <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-400" />
            )}
          </button>
        );
      })}
    </div>
  );
}

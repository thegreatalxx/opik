import { WorkspaceVersion } from "@/store/AppStore";

export const DEFAULT_WORKSPACE_VERSION: WorkspaceVersion = "v1";

const OPIK_VERSION_OVERRIDE_KEY = "opik-version-override";

// Path segments (directly under basepath) that are only valid in V2.
// Add new V2-only top-level routes here — nothing else needs to change.
const V2_ONLY_SEGMENTS: ReadonlySet<string> = new Set(["pair"]);

export function getVersionOverride(): WorkspaceVersion | null {
  const override = localStorage.getItem(OPIK_VERSION_OVERRIDE_KEY);
  return override === "v1" || override === "v2" ? override : null;
}

function getRelativePathSegments(): string[] {
  const basePath = (import.meta.env.VITE_BASE_URL || "/").replace(/\/$/, "");
  const pathname = window.location.pathname;
  const relative = pathname.startsWith(basePath)
    ? pathname.slice(basePath.length)
    : pathname;
  return relative.split("/").filter(Boolean);
}

export function getWorkspaceNameFromPath(): string | null {
  return getRelativePathSegments()[0] || null;
}

// Returns a version that the current path forces regardless of workspace.
// Used by WorkspaceVersionGate to short-circuit V2-only routes (e.g. /pair/*)
// without an API call and without touching localStorage.
export function getForcedVersionFromPath(): WorkspaceVersion | null {
  const [first] = getRelativePathSegments();
  return first && V2_ONLY_SEGMENTS.has(first) ? "v2" : null;
}

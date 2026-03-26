import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useParams, useRouter } from "@tanstack/react-router";
import {
  AssistantSidebarBridge,
  BridgeContext,
  HostEventMap,
} from "@/types/assistant-sidebar";
import { useUserApiKey, useActiveWorkspaceName } from "@/store/AppStore";
import useWorkspace from "@/plugins/comet/useWorkspace";
import useProjectById from "@/api/projects/useProjectById";
import useAssistantSidebarConfig from "@/api/assistant-sidebar/useAssistantSidebarConfig";

const DEV_BASE_URL = import.meta.env.VITE_OLLIE_BASE_URL;

const FAILURE_COOLDOWN_MS = 5 * 60 * 1000;
const FAILURE_KEY = "ollie_load_failure_ts";

interface OllieManifest {
  js: string;
  css?: string;
  shell?: string;
  ver?: string;
}

interface AssistantSidebarProps {
  onWidthChange: (width: number) => void;
}

const loadScript = (src: string): Promise<void> =>
  new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(script);
  });

const isInCooldown = (): boolean => {
  const ts = sessionStorage.getItem(FAILURE_KEY);
  if (!ts) return false;
  return Date.now() - Number(ts) < FAILURE_COOLDOWN_MS;
};

const markFailure = (): void => {
  sessionStorage.setItem(FAILURE_KEY, String(Date.now()));
};

const clearFailure = (): void => {
  sessionStorage.removeItem(FAILURE_KEY);
};

async function fetchManifest(manifestUrl: string): Promise<OllieManifest> {
  const res = await fetch(manifestUrl);
  if (!res.ok) throw new Error(`manifest ${res.status}`);
  return (await res.json()) as OllieManifest;
}

async function loadDevAssets(): Promise<void> {
  await loadScript(`${DEV_BASE_URL}/ollie.js`);
}

async function loadProdAssets(manifestUrl: string): Promise<void> {
  if (isInCooldown()) {
    throw new Error("Ollie load in cooldown");
  }

  try {
    const manifest = await fetchManifest(manifestUrl);
    // Derive base URL by stripping the manifest filename
    const baseUrl = manifestUrl.substring(0, manifestUrl.lastIndexOf("/"));
    await loadScript(`${baseUrl}/${manifest.js}`);
  } catch (err) {
    markFailure();
    throw err;
  }
}

type HostListeners = {
  [K in keyof HostEventMap]: Set<(data: HostEventMap[K]) => void>;
};

function createHostListeners(): HostListeners {
  return {
    "context:changed": new Set(),
    "runner:paired": new Set(),
    "runner:pair-failed": new Set(),
    "runner:connected": new Set(),
  };
}

const IS_DEV = import.meta.env.DEV;

const createBridge = (
  onWidthChangeRef: React.MutableRefObject<(w: number) => void>,
  navigateRef: React.MutableRefObject<(path: string) => void>,
  contextRef: React.MutableRefObject<BridgeContext>,
  listenersRef: React.MutableRefObject<HostListeners>,
): AssistantSidebarBridge => ({
  version: 1,
  getContext: () => contextRef.current,
  subscribe: (event, callback) => {
    const set = listenersRef.current[event] as Set<typeof callback>;
    set.add(callback);
    return () => {
      set.delete(callback);
    };
  },
  emit: (event, data) => {
    if (event === "sidebar:resized") {
      onWidthChangeRef.current((data as { width: number }).width);
    } else if (event === "navigate") {
      navigateRef.current((data as { path: string }).path);
    } else if (IS_DEV) {
      console.warn(`[OllieBridge] Unhandled sidebar event: "${event}"`, data);
    }
  },
});

// --- Suspense resource (module singleton) ---
let status: "idle" | "pending" | "resolved" | "rejected" = "idle";
let promise: Promise<void>;
let currentManifestUrl: string | null = null;

function suspendUntilScript(manifestUrl: string): boolean {
  // If manifest URL changed, reset state to reload
  if (currentManifestUrl !== null && currentManifestUrl !== manifestUrl) {
    status = "idle";
    currentManifestUrl = null;
  }

  switch (status) {
    case "resolved":
      return true;
    case "rejected": {
      if (!isInCooldown()) {
        status = "idle";
        return suspendUntilScript(manifestUrl);
      }
      return false;
    }
    case "pending":
      throw promise;
    case "idle": {
      if (IS_DEV && !DEV_BASE_URL) {
        status = "rejected";
        return false;
      }

      currentManifestUrl = manifestUrl;
      status = "pending";
      promise = (
        DEV_BASE_URL ? loadDevAssets() : loadProdAssets(manifestUrl)
      ).then(
        () => {
          status = "resolved";
          clearFailure();
        },
        () => {
          status = "rejected";
        },
      );
      throw promise;
    }
  }
}

function useBridgeContext(): BridgeContext {
  const apiKey = useUserApiKey();
  const workspaceName = useActiveWorkspaceName();
  const workspace = useWorkspace();

  const { projectId } = useParams({ strict: false }) as {
    projectId?: string;
  };
  const { data: project } = useProjectById(
    { projectId: projectId! },
    { enabled: !!projectId },
  );

  const workspaceId = workspace?.workspaceId ?? "";
  const projectName = project?.name ?? null;
  const resolvedProjectId = projectId ?? null;

  return useMemo<BridgeContext>(
    () => ({
      workspaceId,
      workspaceName,
      projectId: resolvedProjectId,
      projectName,
      authToken: apiKey,
      baseApiUrl: "/api",
      assistantBackendUrl: "/ollie-assist",
      theme: "light",
    }),
    [workspaceId, workspaceName, resolvedProjectId, projectName, apiKey],
  );
}

const AssistantSidebarContent: React.FC<
  AssistantSidebarProps & { manifestUrl: string }
> = ({ onWidthChange, manifestUrl }) => {
  const scriptReady = suspendUntilScript(manifestUrl);
  const context = useBridgeContext();
  const router = useRouter();

  const onWidthChangeRef = useRef(onWidthChange);
  onWidthChangeRef.current = onWidthChange;

  const contextRef = useRef(context);
  contextRef.current = context;

  const navigateRef = useRef((path: string) => {
    const ws = contextRef.current.workspaceName;
    const fullPath = ws ? `/${ws}${path}` : path;
    router.navigate({ to: fullPath });
  });
  navigateRef.current = (path: string) => {
    const ws = contextRef.current.workspaceName;
    const fullPath = ws ? `/${ws}${path}` : path;
    router.navigate({ to: fullPath });
  };

  const listenersRef = useRef<HostListeners>(createHostListeners());

  const bridgeRef = useRef(
    createBridge(onWidthChangeRef, navigateRef, contextRef, listenersRef),
  );
  const mountedElRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    for (const listener of listenersRef.current["context:changed"]) {
      listener(context);
    }
  }, [context]);

  const containerRef = useCallback((el: HTMLDivElement | null) => {
    if (mountedElRef.current && window.OllieConsole) {
      try {
        window.OllieConsole.unmount(mountedElRef.current);
      } catch (err) {
        console.error("[OllieSidebar] unmount failed:", err);
      }
      mountedElRef.current = null;
      onWidthChangeRef.current(0);
    }
    if (el && window.OllieConsole) {
      try {
        window.OllieConsole.mount(el, bridgeRef.current);
        mountedElRef.current = el;
      } catch (err) {
        console.error("[OllieSidebar] mount failed:", err);
      }
    }
  }, []);

  if (!scriptReady) return null;

  return (
    <div className="comet-assistant-sidebar-root absolute bottom-0 right-0 top-[var(--banner-height)] z-10">
      <div ref={containerRef} className="h-full" />
    </div>
  );
};

const AssistantSidebar: React.FC<AssistantSidebarProps> = ({
  onWidthChange,
}) => {
  const { data: sidebarConfig } = useAssistantSidebarConfig();
  const [ready, setReady] = useState(false);

  const enabled = sidebarConfig?.enabled ?? false;
  const manifestUrl = sidebarConfig?.manifest_url ?? "";

  useEffect(() => {
    if (enabled && manifestUrl) {
      setReady(true);
    }
  }, [enabled, manifestUrl]);

  if (!ready || !manifestUrl) return null;

  return (
    <AssistantSidebarContent
      onWidthChange={onWidthChange}
      manifestUrl={manifestUrl}
    />
  );
};

export default AssistantSidebar;

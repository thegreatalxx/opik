import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { useParams, useRouter } from "@tanstack/react-router";
import { useIsFeatureEnabled } from "@/components/feature-toggles-provider";
import { FeatureToggleKeys } from "@/types/feature-toggles";
import {
  AssistantSidebarBridge,
  BridgeContext,
  HostEventMap,
} from "@/types/assistant-sidebar";
import { useUserApiKey, useActiveWorkspaceName } from "@/store/AppStore";
import useWorkspace from "@/plugins/comet/useWorkspace";
import useProjectById from "@/api/projects/useProjectById";

const DEV_BASE_URL =
  import.meta.env.VITE_OLLIE_BASE_URL ||
  import.meta.env.VITE_ASSISTANT_SIDEBAR_URL;

const OLLIE_BRIDGE_VERSION = 1;
const PROD_BASE = "/ollie";
const FAILURE_COOLDOWN_MS = 5 * 60 * 1000;
const FAILURE_KEY = "ollie_load_failure_ts";

interface OllieManifest {
  js: string;
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

async function fetchManifest(
  baseUrl: string,
  retry = true,
): Promise<OllieManifest> {
  try {
    const res = await fetch(`${baseUrl}/manifest.json`);
    if (!res.ok) throw new Error(`manifest ${res.status}`);
    return (await res.json()) as OllieManifest;
  } catch (err) {
    if (retry) return fetchManifest(baseUrl, false);
    throw err;
  }
}

async function loadDevAssets(): Promise<void> {
  await loadScript(`${DEV_BASE_URL}/ollie.js`);
}

async function loadProdAssets(): Promise<void> {
  if (isInCooldown()) {
    throw new Error("Ollie load in cooldown");
  }

  try {
    const versionBase = `${PROD_BASE}/v${OLLIE_BRIDGE_VERSION}`;
    const manifest = await fetchManifest(versionBase);

    await loadScript(`${versionBase}/${manifest.js}`);
  } catch (err) {
    markFailure();
    throw err;
  }
}

type ContextChangedListener = (data: HostEventMap["context:changed"]) => void;

const createBridge = (
  onWidthChangeRef: React.MutableRefObject<(w: number) => void>,
  navigateRef: React.MutableRefObject<(path: string) => void>,
  contextRef: React.MutableRefObject<BridgeContext>,
  listenersRef: React.MutableRefObject<Set<ContextChangedListener>>,
): AssistantSidebarBridge => ({
  version: 1,
  getContext: () => contextRef.current,
  subscribe: (event, callback) => {
    if (event === "context:changed") {
      const listener = callback as ContextChangedListener;
      listenersRef.current.add(listener);
      return () => {
        listenersRef.current.delete(listener);
      };
    }
    return () => {};
  },
  emit: (event, data) => {
    if (event === "sidebar:resized") {
      onWidthChangeRef.current((data as { width: number }).width);
    } else if (event === "navigate") {
      navigateRef.current((data as { path: string }).path);
    }
  },
});

// --- Suspense resource (module singleton) ---
let status: "idle" | "pending" | "resolved" | "rejected" = "idle";
let promise: Promise<void>;

const IS_DEV = import.meta.env.DEV;

function suspendUntilScript(): boolean {
  switch (status) {
    case "resolved":
      return true;
    case "rejected":
      return false;
    case "pending":
      throw promise;
    case "idle": {
      // Dev mode without a dev URL configured — nothing to load
      if (IS_DEV && !DEV_BASE_URL) {
        status = "rejected";
        return false;
      }

      status = "pending";
      promise = (DEV_BASE_URL ? loadDevAssets() : loadProdAssets()).then(
        () => {
          status = "resolved";
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

const AssistantSidebarContent: React.FC<AssistantSidebarProps> = ({
  onWidthChange,
}) => {
  const scriptReady = suspendUntilScript();
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

  const listenersRef = useRef<Set<ContextChangedListener>>(new Set());
  const bridgeRef = useRef(
    createBridge(onWidthChangeRef, navigateRef, contextRef, listenersRef),
  );
  const mountedElRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    for (const listener of listenersRef.current) {
      listener(context);
    }
  }, [context]);

  const containerRef = useCallback((el: HTMLDivElement | null) => {
    if (mountedElRef.current && window.OllieConsole) {
      window.OllieConsole.unmount(mountedElRef.current);
      mountedElRef.current = null;
      onWidthChangeRef.current(0);
    }
    if (el && window.OllieConsole) {
      window.OllieConsole.mount(el, bridgeRef.current);
      mountedElRef.current = el;
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
  const isEnabled = useIsFeatureEnabled(
    FeatureToggleKeys.ASSISTANT_SIDEBAR_ENABLED,
  );
  if (!isEnabled) return null;
  return <AssistantSidebarContent onWidthChange={onWidthChange} />;
};

export default AssistantSidebar;

import { useCallback, useEffect, useRef, useState } from "react";
import { useTheme } from "@/components/theme-provider";
import { THEME_MODE } from "@/constants/theme";
import { useActiveWorkspaceName, useUserApiKey } from "@/store/AppStore";
import { useMatchRoute, useNavigate } from "@tanstack/react-router";
import { BASE_API_URL } from "@/api/api";

const OLLIE_BASE_URL = import.meta.env.VITE_OLLIE_BASE_URL;
const OLLIE_ASSIST_URL = import.meta.env.VITE_OLLIE_ASSIST_URL;

type BridgeContext = {
  workspaceId: string;
  workspaceName: string;
  projectId: string | null;
  projectName: string | null;
  authToken: string;
  baseApiUrl: string;
  assistantBackendUrl: string;
  theme: "light" | "dark";
};

type AssistantSidebarBridge = {
  version: number;
  getContext: () => BridgeContext;
  subscribe: (
    event: string,
    callback: (data: BridgeContext) => void,
  ) => () => void;
  emit: (event: string, data: unknown) => void;
};

declare global {
  interface Window {
    OllieConsole?: {
      mount: (el: HTMLElement, bridge: AssistantSidebarBridge) => void;
      unmount: (el: HTMLElement) => void;
    };
  }
}

function useProjectFromRoute(): {
  projectId: string | null;
  projectName: string | null;
} {
  const matchRoute = useMatchRoute();
  const match = matchRoute({
    to: "/workspaceGuard/$workspaceName/projects/$projectId",
    fuzzy: true,
  });
  if (match && typeof match === "object" && "projectId" in match) {
    return { projectId: match.projectId as string, projectName: null };
  }
  return { projectId: null, projectName: null };
}

const OllieSidebar = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);
  const contextListeners = useRef<Set<(ctx: BridgeContext) => void>>(
    new Set(),
  );

  const { themeMode } = useTheme();
  const workspaceName = useActiveWorkspaceName();
  const apiKey = useUserApiKey();
  const navigate = useNavigate();
  const { projectId, projectName } = useProjectFromRoute();

  const getContext = useCallback((): BridgeContext => {
    return {
      workspaceId: workspaceName,
      workspaceName,
      projectId,
      projectName,
      authToken: apiKey,
      baseApiUrl: BASE_API_URL,
      assistantBackendUrl: OLLIE_ASSIST_URL,
      theme: themeMode === THEME_MODE.DARK ? "dark" : "light",
    };
  }, [workspaceName, apiKey, projectId, projectName, themeMode]);

  useEffect(() => {
    if (!OLLIE_BASE_URL || loaded) return;

    const script = document.createElement("script");
    script.src = `${OLLIE_BASE_URL}/ollie.js`;
    script.onload = () => setLoaded(true);
    document.head.appendChild(script);

    return () => {
      script.remove();
    };
  }, [loaded]);

  useEffect(() => {
    const el = containerRef.current;
    if (!loaded || !el || !window.OllieConsole) return;

    const bridge: AssistantSidebarBridge = {
      version: 1,
      getContext,
      subscribe: (event, callback) => {
        if (event === "context:changed") {
          contextListeners.current.add(callback);
          return () => contextListeners.current.delete(callback);
        }
        return () => {};
      },
      emit: (event, data) => {
        if (event === "navigate") {
          const { path } = data as { path: string };
          navigate({ to: path });
        }
      },
    };

    window.OllieConsole.mount(el, bridge);

    return () => {
      window.OllieConsole?.unmount(el);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  useEffect(() => {
    const ctx = getContext();
    contextListeners.current.forEach((cb) => cb(ctx));
  }, [getContext]);

  if (!OLLIE_BASE_URL) return null;

  return <div ref={containerRef} className="shrink-0" />;
};

export default OllieSidebar;

import { useEffect, useRef } from "react";
import { useNavigate, useParams, useRouterState } from "@tanstack/react-router";
import { useActiveWorkspaceName } from "@/store/AppStore";
import Loader from "@/shared/Loader/Loader";

// Maps old ?tab= values to project-scoped route suffixes
const TAB_ROUTE_MAP: Record<string, string> = {
  "annotation-queues": "/annotation-queues",
  rules: "/online-evaluation",
  configuration: "/agent-configuration",
  insights: "/insights",
  metrics: "/insights",
};

// Maps old ?type= values (legacy single-param format)
const LEGACY_TYPE_MAP: Record<string, string> = {
  metrics: "/insights",
};

const TracesTabRedirect = () => {
  const workspaceName = useActiveWorkspaceName();
  const { projectId } = useParams({ strict: false }) as {
    projectId?: string;
  };
  const navigate = useNavigate();
  const search = useRouterState({
    select: (s) => s.location.search as Record<string, string>,
  });
  const hasRedirected = useRef(false);

  useEffect(() => {
    if (!projectId || hasRedirected.current) return;

    const tab = search.tab;
    const legacyType = search.type;
    const legacyView = search.view;

    const navigateToProjectRoute = (suffix: string) => {
      hasRedirected.current = true;
      navigate({
        to: `/$workspaceName/projects/$projectId${suffix}`,
        params: { workspaceName, projectId },
        replace: true,
      });
    };

    // ?tab= takes priority
    if (tab && TAB_ROUTE_MAP[tab]) {
      navigateToProjectRoute(TAB_ROUTE_MAP[tab]);
      return;
    }

    // Legacy ?type= param
    if (legacyType && LEGACY_TYPE_MAP[legacyType]) {
      navigateToProjectRoute(LEGACY_TYPE_MAP[legacyType]);
      return;
    }

    // Legacy ?view=dashboards → insights
    if (legacyView === "dashboards") {
      navigateToProjectRoute("/insights");
      return;
    }

    // Default: redirect to /logs, preserving logsType and legacy type if it's a logs type
    const logsType = search.logsType ?? legacyType ?? undefined;

    hasRedirected.current = true;
    navigate({
      to: "/$workspaceName/projects/$projectId/logs",
      params: { workspaceName, projectId },
      search: logsType ? { logsType } : undefined,
      replace: true,
    });
  }, [workspaceName, projectId, search, navigate]);

  return <Loader />;
};

export default TracesTabRedirect;

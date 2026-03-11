import React from "react";
import { Outlet, useMatchRoute } from "@tanstack/react-router";
import ScheduledAgentsPage from "@/components/pages/ScheduledAgentsPage/ScheduledAgentsPage";

const ScheduledAgentsRouteWrapper: React.FunctionComponent = () => {
  const matchRoute = useMatchRoute();
  const isRootRoute = matchRoute({
    to: "/$workspaceName/scheduled-agents",
  });

  if (isRootRoute) {
    return <ScheduledAgentsPage />;
  }

  return <Outlet />;
};

export default ScheduledAgentsRouteWrapper;

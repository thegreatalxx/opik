export const ASSISTANT_SIDEBAR_DEFAULT_WIDTH = 400;
export const ASSISTANT_SIDEBAR_COLLAPSED_WIDTH = 33;

export const getStoredAssistantSidebarWidth = (): number => {
  try {
    const parsed = parseInt(
      localStorage.getItem("assistant-sidebar-width") ?? "",
      10,
    );
    if (parsed > 0) return parsed;
  } catch {
    /* localStorage unavailable */
  }
  return ASSISTANT_SIDEBAR_DEFAULT_WIDTH;
};

export const isAssistantSidebarOpen = (): boolean => {
  try {
    const stored = localStorage.getItem("assistant-sidebar-open");
    return stored === null ? true : stored === "true";
  } catch {
    return true;
  }
};

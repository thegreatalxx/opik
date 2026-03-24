import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import V1CompatRedirect from "./V1CompatRedirect";

const mockNavigate = vi.fn();

let mockActiveProjectId: string | null = "proj-123";
let mockIsProjectLoading = false;
let mockSplat = "";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mockNavigate,
  useParams: () => ({ _splat: mockSplat }),
}));

vi.mock("@/store/AppStore", () => ({
  useActiveWorkspaceName: () => "default",
  useActiveProjectId: () => mockActiveProjectId,
  useIsProjectLoading: () => mockIsProjectLoading,
}));

vi.mock("@/shared/Loader/Loader", () => ({
  default: () => <div data-testid="loader" />,
}));

describe("V1CompatRedirect", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockActiveProjectId = "proj-123";
    mockIsProjectLoading = false;
    mockSplat = "";
  });

  it("redirects /$ws/experiments to project-scoped /experiments", () => {
    render(<V1CompatRedirect toPath="/experiments" />);
    expect(mockNavigate).toHaveBeenCalledWith({
      to: "/default/projects/proj-123/experiments",
      replace: true,
    });
  });

  it("redirects /$ws/prompts with splat to project-scoped /prompts/abc", () => {
    mockSplat = "abc123";
    render(<V1CompatRedirect toPath="/prompts" />);
    expect(mockNavigate).toHaveBeenCalledWith({
      to: "/default/projects/proj-123/prompts/abc123",
      replace: true,
    });
  });

  it("redirects to projects list when no active project and not loading", () => {
    mockActiveProjectId = null;
    render(<V1CompatRedirect toPath="/experiments" />);
    expect(mockNavigate).toHaveBeenCalledWith({
      to: "/$workspaceName/projects",
      params: { workspaceName: "default" },
      replace: true,
    });
  });

  it("does not navigate while project is loading", () => {
    mockIsProjectLoading = true;
    mockActiveProjectId = null;
    render(<V1CompatRedirect toPath="/experiments" />);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("redirects /$ws/evaluation-suites with nested path", () => {
    mockSplat = "suite-id/items";
    render(<V1CompatRedirect toPath="/evaluation-suites" />);
    expect(mockNavigate).toHaveBeenCalledWith({
      to: "/default/projects/proj-123/evaluation-suites/suite-id/items",
      replace: true,
    });
  });
});

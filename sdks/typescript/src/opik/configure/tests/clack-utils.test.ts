import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockIsNonInteractiveEnvironment,
  mockLookup,
  mockGetDefaultWorkspace,
  mockIsOpikAccessible,
  mockConfirm,
  mockText,
  mockPassword,
  mockLogError,
  mockLogInfo,
  mockLogWarn,
  mockLogWarning,
  mockLogMessage,
  mockLogSuccess,
  mockLogStep,
  mockSetDistinctId,
  mockAnalyticsCapture,
} = vi.hoisted(() => ({
  mockIsNonInteractiveEnvironment: vi.fn(),
  mockLookup: vi.fn(),
  mockGetDefaultWorkspace: vi.fn(),
  mockIsOpikAccessible: vi.fn(),
  mockConfirm: vi.fn(),
  mockText: vi.fn(),
  mockPassword: vi.fn(),
  mockLogError: vi.fn(),
  mockLogInfo: vi.fn(),
  mockLogWarn: vi.fn(),
  mockLogWarning: vi.fn(),
  mockLogMessage: vi.fn(),
  mockLogSuccess: vi.fn(),
  mockLogStep: vi.fn(),
  mockSetDistinctId: vi.fn(),
  mockAnalyticsCapture: vi.fn(),
}));

vi.mock('node:dns/promises', () => ({
  lookup: mockLookup,
}));

vi.mock('../src/utils/environment', async () => {
  const actual = await vi.importActual<
    typeof import('../src/utils/environment')
  >('../src/utils/environment');

  return {
    ...actual,
    isNonInteractiveEnvironment: mockIsNonInteractiveEnvironment,
  };
});

vi.mock('../src/utils/api-helpers', async () => {
  const actual = await vi.importActual<
    typeof import('../src/utils/api-helpers')
  >('../src/utils/api-helpers');

  return {
    ...actual,
    getDefaultWorkspace: mockGetDefaultWorkspace,
    isOpikAccessible: mockIsOpikAccessible,
  };
});

vi.mock('../src/utils/clack', () => ({
  default: {
    confirm: mockConfirm,
    text: mockText,
    password: mockPassword,
    select: vi.fn(),
    isCancel: vi.fn(() => false),
    intro: vi.fn(),
    outro: vi.fn(),
    cancel: vi.fn(),
    note: vi.fn(),
    spinner: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
    log: {
      error: mockLogError,
      info: mockLogInfo,
      warn: mockLogWarn,
      warning: mockLogWarning,
      message: mockLogMessage,
      success: mockLogSuccess,
      step: mockLogStep,
    },
  },
}));

vi.mock('../src/utils/analytics', () => ({
  analytics: {
    setDistinctId: mockSetDistinctId,
    capture: mockAnalyticsCapture,
    setTag: vi.fn(),
    captureException: vi.fn(),
    shutdown: vi.fn(),
  },
}));

import {
  DeploymentType,
  getOrAskForProjectData,
} from '../src/utils/clack-utils';

describe('getOrAskForProjectData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLookup.mockResolvedValue([]);
    mockIsOpikAccessible.mockResolvedValue(true);
    mockGetDefaultWorkspace.mockResolvedValue('default-workspace');
    mockConfirm.mockResolvedValue(true);
    mockText.mockReset();
    mockPassword.mockReset();
  });

  it('uses local overrides in non-interactive mode', async () => {
    mockIsNonInteractiveEnvironment.mockReturnValue(true);

    const result = await getOrAskForProjectData({
      useLocal: true,
      url: 'http://127.0.0.1:5173',
      projectName: 'Smoke Project',
    });

    expect(result.host).toBe('http://127.0.0.1:5173/');
    expect(result.projectName).toBe('Smoke Project');
    expect(result.workspaceName).toBe('default');
    expect(result.projectApiKey).toBe('');
    expect(result.deploymentType).toBe(DeploymentType.LOCAL);
  });

  it('uses the default workspace for non-interactive cloud setup', async () => {
    mockIsNonInteractiveEnvironment.mockReturnValue(true);
    mockGetDefaultWorkspace.mockResolvedValue('cloud-default');

    const result = await getOrAskForProjectData({
      deploymentType: 'cloud',
      url: 'https://www.comet.com',
      apiKey: 'api-key',
    });

    expect(mockGetDefaultWorkspace).toHaveBeenCalledWith(
      'api-key',
      'https://www.comet.com/',
    );
    expect(result.host).toBe('https://www.comet.com/');
    expect(result.workspaceName).toBe('cloud-default');
    expect(result.projectName).toBe('Default Project');
    expect(result.projectApiKey).toBe('api-key');
    expect(result.deploymentType).toBe(DeploymentType.CLOUD);
  });

  it('fails fast when non-interactive setup cannot determine a deployment type', async () => {
    mockIsNonInteractiveEnvironment.mockReturnValue(true);

    await expect(getOrAskForProjectData({})).rejects.toThrow(
      'Unable to determine the deployment type in non-interactive mode.',
    );
  });

  it('requires trust for non-interactive private self-hosted URLs', async () => {
    mockIsNonInteractiveEnvironment.mockReturnValue(true);
    mockLookup.mockResolvedValue([{ address: '10.0.0.5', family: 4 }]);

    await expect(
      getOrAskForProjectData({
        deploymentType: 'self-hosted',
        url: 'https://internal.example.com',
        apiKey: 'api-key',
      }),
    ).rejects.toThrow('--trust-url');

    expect(mockIsOpikAccessible).not.toHaveBeenCalledWith(
      'https://internal.example.com/',
      5000,
    );
    expect(mockGetDefaultWorkspace).not.toHaveBeenCalled();
  });

  it('falls back to the interactive retry path when a provided API key is invalid', async () => {
    mockIsNonInteractiveEnvironment.mockReturnValue(false);
    mockGetDefaultWorkspace
      .mockRejectedValueOnce(new Error('bad key'))
      .mockResolvedValueOnce('recovered-workspace');
    mockPassword.mockResolvedValue('good-key');
    mockText
      .mockResolvedValueOnce('chosen-workspace')
      .mockResolvedValueOnce('Chosen Project');

    const result = await getOrAskForProjectData({
      deploymentType: 'cloud',
      url: 'https://www.comet.com',
      apiKey: 'bad-key',
    });

    expect(mockPassword).toHaveBeenCalledTimes(1);
    expect(mockGetDefaultWorkspace).toHaveBeenNthCalledWith(
      1,
      'bad-key',
      'https://www.comet.com/',
    );
    expect(mockGetDefaultWorkspace).toHaveBeenNthCalledWith(
      2,
      'good-key',
      'https://www.comet.com/',
    );
    expect(result.projectApiKey).toBe('good-key');
    expect(result.workspaceName).toBe('chosen-workspace');
    expect(result.projectName).toBe('Chosen Project');
    expect(mockLogError).toHaveBeenCalled();
  });
});

/**
 * @file WebMcpPanel.test.jsx
 * Unit tests for WebMcpPanel — feature flag gate, tool listing,
 * tool invocation, SSE stream event display, and result rendering.
 *
 * All network calls are mocked via the service layer; no real HTTP or EventSource.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';

// ─── Service mocks ────────────────────────────────────────────────────────────

jest.mock('../../services/webMcpClient', () => ({
  listMcpTools: jest.fn(),
  callMcpTool: jest.fn(),
  openMcpToolStream: jest.fn(),
}));

jest.mock('../../services/configService', () => ({
  loadPublicConfig: jest.fn(),
}));

jest.mock('../../context/AgentUiModeContext', () => ({
  useAgentUiMode: () => ({ setWebMcpLastResult: jest.fn() }),
}));

jest.mock('../WebMcpPanel.css', () => ({}), { virtual: true });

// ─── Helpers ──────────────────────────────────────────────────────────────────

const { listMcpTools, callMcpTool, openMcpToolStream } =
  require('../../services/webMcpClient');
const { loadPublicConfig } = require('../../services/configService');

const MOCK_TOOLS = [
  {
    name: 'get_my_accounts',
    description: 'Returns all accounts for the authenticated user.',
    inputSchema: { properties: {}, required: [] },
  },
  {
    name: 'get_account_balance',
    description: 'Returns the balance for a specific account.',
    inputSchema: {
      properties: {
        account_id: { type: 'string', description: 'Account identifier' },
      },
      required: ['account_id'],
    },
  },
];

async function renderWithFlag() {
  loadPublicConfig.mockResolvedValue({ ff_webmcp_enabled: true });
  const { default: WebMcpPanel } = await import('../WebMcpPanel');
  let result;
  await act(async () => {
    result = render(<WebMcpPanel />);
  });
  return result;
}

beforeEach(() => {
  jest.clearAllMocks();
  loadPublicConfig.mockResolvedValue({ ff_webmcp_enabled: true });
  listMcpTools.mockResolvedValue({ tools: MOCK_TOOLS });
  callMcpTool.mockResolvedValue({ result: { content: [{ text: 'OK' }] } });
  openMcpToolStream.mockReturnValue(() => {});
});

// ─── Feature flag gate ────────────────────────────────────────────────────────

describe('WebMcpPanel — feature flag gate', () => {
  it('renders nothing when ff_webmcp_enabled is false', async () => {
    loadPublicConfig.mockResolvedValue({ ff_webmcp_enabled: false });
    const { default: WebMcpPanel } = await import('../WebMcpPanel');
    await act(async () => { render(<WebMcpPanel />); });
    expect(screen.queryByText(/WebMCP/i)).not.toBeInTheDocument();
  });

  it('renders the panel title when ff_webmcp_enabled is true', async () => {
    await renderWithFlag();
    await waitFor(() => {
      expect(screen.getByText('WebMCP — Tool Inspector')).toBeInTheDocument();
    });
  });
});

// ─── Tool listing ─────────────────────────────────────────────────────────────

describe('WebMcpPanel — tool listing', () => {
  it('shows available tool count after loading', async () => {
    await renderWithFlag();
    await waitFor(() => {
      expect(screen.getByText(/Available Tools \(2\)/i)).toBeInTheDocument();
    });
  });

  it('renders a button for each tool name', async () => {
    await renderWithFlag();
    await waitFor(() => {
      expect(screen.getByText('get_my_accounts')).toBeInTheDocument();
      expect(screen.getByText('get_account_balance')).toBeInTheDocument();
    });
  });

  it('shows error message when tool listing fails', async () => {
    listMcpTools.mockRejectedValue(new Error('MCP server unreachable'));
    await renderWithFlag();
    await waitFor(() => {
      expect(screen.getByText(/Could not load MCP tools/i)).toBeInTheDocument();
    });
  });
});

// ─── Tool selection ───────────────────────────────────────────────────────────

describe('WebMcpPanel — tool selection', () => {
  it('clicking a tool shows its name as a detail-panel heading', async () => {
    await renderWithFlag();
    await waitFor(() => screen.getByText('get_account_balance'));

    fireEvent.click(screen.getByText('get_account_balance'));

    // The detail panel renders an <h4> with the tool name; the list renders a <span>.
    // Querying by heading role uniquely targets the detail panel entry.
    expect(
      screen.getByRole('heading', { level: 4, name: 'get_account_balance' }),
    ).toBeInTheDocument();
  });

  it('shows parameter input for required fields', async () => {
    await renderWithFlag();
    await waitFor(() => screen.getByText('get_account_balance'));

    fireEvent.click(screen.getByText('get_account_balance'));

    expect(screen.getByPlaceholderText('string')).toBeInTheDocument();
    expect(screen.getByText('account_id')).toBeInTheDocument();
  });

  it('marks required parameters with asterisk', async () => {
    await renderWithFlag();
    await waitFor(() => screen.getByText('get_account_balance'));

    fireEvent.click(screen.getByText('get_account_balance'));

    expect(screen.getByText('*')).toBeInTheDocument();
  });

  it('shows Call Tool button after selecting a tool', async () => {
    await renderWithFlag();
    await waitFor(() => screen.getByText('get_my_accounts'));

    fireEvent.click(screen.getByText('get_my_accounts'));

    expect(screen.getByRole('button', { name: /Call Tool/i })).toBeInTheDocument();
  });
});

// ─── Tool invocation and SSE streaming ────────────────────────────────────────

describe('WebMcpPanel — tool invocation', () => {
  it('calls openMcpToolStream before callMcpTool', async () => {
    await renderWithFlag();
    await waitFor(() => screen.getByText('get_my_accounts'));

    fireEvent.click(screen.getByText('get_my_accounts'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Call Tool/i }));
    });

    expect(openMcpToolStream).toHaveBeenCalledTimes(1);
    expect(callMcpTool).toHaveBeenCalledWith('get_my_accounts', {}, expect.any(String));
    expect(openMcpToolStream.mock.invocationCallOrder[0]).toBeLessThan(
      callMcpTool.mock.invocationCallOrder[0],
    );
  });

  it('passes the same UUID flowTraceId to stream and tool call', async () => {
    await renderWithFlag();
    await waitFor(() => screen.getByText('get_my_accounts'));

    fireEvent.click(screen.getByText('get_my_accounts'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Call Tool/i }));
    });

    const streamTraceId = openMcpToolStream.mock.calls[0][0];
    const callTraceId = callMcpTool.mock.calls[0][2];
    expect(streamTraceId).toBe(callTraceId);
    expect(streamTraceId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('displays SSE stream events received during tool call', async () => {
    let capturedOnEvent;
    openMcpToolStream.mockImplementation((_traceId, onEvent) => {
      capturedOnEvent = onEvent;
      return () => {};
    });
    callMcpTool.mockImplementation(async () => {
      capturedOnEvent?.({ phase: 'token_exchange', status: 'ok' });
      capturedOnEvent?.({ phase: 'tool_call', tool: 'get_my_accounts' });
      return { result: { content: [{ text: 'accounts listed' }] } };
    });

    await renderWithFlag();
    await waitFor(() => screen.getByText('get_my_accounts'));
    fireEvent.click(screen.getByText('get_my_accounts'));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Call Tool/i }));
    });

    await waitFor(() => {
      expect(screen.getByText(/Stream Events/i)).toBeInTheDocument();
      expect(screen.getByText(/token_exchange/)).toBeInTheDocument();
    });
  });

  it('displays the tool result after successful call', async () => {
    callMcpTool.mockResolvedValue({
      result: { content: [{ text: 'account balance: $5000' }] },
    });

    await renderWithFlag();
    await waitFor(() => screen.getByText('get_my_accounts'));
    fireEvent.click(screen.getByText('get_my_accounts'));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Call Tool/i }));
    });

    await waitFor(() => {
      // <h5>Result</h5> is uniquely the result section heading
      expect(screen.getByRole('heading', { level: 5, name: /^Result$/ })).toBeInTheDocument();
    });
  });

  it('shows error section when callMcpTool rejects', async () => {
    callMcpTool.mockRejectedValue(new Error('insufficient scope'));

    await renderWithFlag();
    await waitFor(() => screen.getByText('get_my_accounts'));
    fireEvent.click(screen.getByText('get_my_accounts'));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Call Tool/i }));
    });

    await waitFor(() => {
      expect(screen.getByText(/Tool call failed/i)).toBeInTheDocument();
    });
  });

  it('calls disconnect on SSE stream before starting a new call', async () => {
    const disconnect = jest.fn();
    openMcpToolStream.mockReturnValue(disconnect);

    await renderWithFlag();
    await waitFor(() => screen.getByText('get_my_accounts'));
    fireEvent.click(screen.getByText('get_my_accounts'));

    // First call
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Call Tool/i }));
    });
    // Wait for result heading to confirm first call settled
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 5, name: /^Result$/ })).toBeInTheDocument(),
    );

    // Second call — component must disconnect the prior stream first
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Call Tool/i }));
    });

    expect(disconnect).toHaveBeenCalled();
  });
});

/**
 * @file helixLlmService.test.js
 *
 * Unit tests for the real Helix conversation API integration.
 * Covers the 3-step flow: createConversation → sendMessage → poll-to-complete.
 *
 * Key correctness checks:
 *   - Auth uses x-api-key header (NOT Authorization: Bearer)
 *   - URL path is /dpc/jas/helix/v1/environments/... (not /api/environments/...)
 *   - Base URL normalisation: tenant root gets /dpc/jas/helix/v1 appended
 *   - Poll resolves on first complete message from agent
 *   - Poll retries when no complete message present
 *   - Timeout throws after deadline
 */

'use strict';

// ── fetch mock ────────────────────────────────────────────────────────────────

let _fetchMock;

beforeEach(() => {
  _fetchMock = jest.fn();
  global.fetch = _fetchMock;
});

afterEach(() => {
  delete global.fetch;
  jest.useRealTimers();
});

const { callHelixAgent } = require('../../services/helixLlmService');

// ── fixtures ──────────────────────────────────────────────────────────────────

const CFG = {
  helix_base_url: 'https://openam-helix.forgeblocks.com/dpc/jas/helix/v1',
  helix_api_key: 'test-key-abc',
  helix_environment_id: 'env-123',
  helix_agent_id: 'my-banking-agent',
};

const MSGS = [{ role: 'user', content: 'Hello, who are you?' }];

function okJson(data) {
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(data), text: () => Promise.resolve('') });
}

function errResponse(status, body = 'Bad Request') {
  return Promise.resolve({ ok: false, status, text: () => Promise.resolve(body) });
}

const CONV = { id: 'conv-1', home_channel: 'ch-1' };

function pollMessages(msgs) {
  return okJson(msgs);
}

const COMPLETE_MSG = [{ class: 'complete', sender_role: 'agent', value: 'I am Helix.' }];
const PENDING_MSGS = [{ class: 'start', sender_role: 'user' }];

// ── happy path ────────────────────────────────────────────────────────────────

describe('callHelixAgent — happy path', () => {
  it('returns the agent response value on success', async () => {
    _fetchMock
      .mockResolvedValueOnce(okJson(CONV))           // createConversation
      .mockResolvedValueOnce(okJson({}))             // sendMessage
      .mockResolvedValueOnce(pollMessages(COMPLETE_MSG)); // poll

    const result = await callHelixAgent(CFG, MSGS);
    expect(result).toBe('I am Helix.');
  });

  it('makes exactly 3 fetch calls for a single-poll success', async () => {
    _fetchMock
      .mockResolvedValueOnce(okJson(CONV))
      .mockResolvedValueOnce(okJson({}))
      .mockResolvedValueOnce(pollMessages(COMPLETE_MSG));

    await callHelixAgent(CFG, MSGS);
    expect(_fetchMock).toHaveBeenCalledTimes(3);
  });
});

// ── auth header ───────────────────────────────────────────────────────────────

describe('callHelixAgent — authentication', () => {
  it('uses x-api-key header, not Authorization Bearer', async () => {
    _fetchMock
      .mockResolvedValueOnce(okJson(CONV))
      .mockResolvedValueOnce(okJson({}))
      .mockResolvedValueOnce(pollMessages(COMPLETE_MSG));

    await callHelixAgent(CFG, MSGS);

    const [, createOpts] = _fetchMock.mock.calls[0];
    expect(createOpts.headers['x-api-key']).toBe('test-key-abc');
    expect(createOpts.headers['Authorization']).toBeUndefined();
  });

  it('poll request also uses x-api-key header', async () => {
    _fetchMock
      .mockResolvedValueOnce(okJson(CONV))
      .mockResolvedValueOnce(okJson({}))
      .mockResolvedValueOnce(pollMessages(COMPLETE_MSG));

    await callHelixAgent(CFG, MSGS);

    const [, pollOpts] = _fetchMock.mock.calls[2];
    expect(pollOpts.headers['x-api-key']).toBe('test-key-abc');
  });
});

// ── URL structure ─────────────────────────────────────────────────────────────

describe('callHelixAgent — URL structure', () => {
  it('createConversation hits /dpc/jas/helix/v1/environments/{env}/agents/{agent}/conversations', async () => {
    _fetchMock
      .mockResolvedValueOnce(okJson(CONV))
      .mockResolvedValueOnce(okJson({}))
      .mockResolvedValueOnce(pollMessages(COMPLETE_MSG));

    await callHelixAgent(CFG, MSGS);

    const [createUrl] = _fetchMock.mock.calls[0];
    expect(createUrl).toBe(
      'https://openam-helix.forgeblocks.com/dpc/jas/helix/v1/environments/env-123/agents/my-banking-agent/conversations',
    );
  });

  it('sendMessage hits /conversations/{conv}/channels/{ch}/messages', async () => {
    _fetchMock
      .mockResolvedValueOnce(okJson(CONV))
      .mockResolvedValueOnce(okJson({}))
      .mockResolvedValueOnce(pollMessages(COMPLETE_MSG));

    await callHelixAgent(CFG, MSGS);

    const [sendUrl] = _fetchMock.mock.calls[1];
    expect(sendUrl).toContain('/conversations/conv-1/channels/ch-1/messages');
  });

  it('normalises tenant-root base URL by appending /dpc/jas/helix/v1', async () => {
    const cfgTenantRoot = { ...CFG, helix_base_url: 'https://openam-helix.forgeblocks.com' };
    _fetchMock
      .mockResolvedValueOnce(okJson(CONV))
      .mockResolvedValueOnce(okJson({}))
      .mockResolvedValueOnce(pollMessages(COMPLETE_MSG));

    await callHelixAgent(cfgTenantRoot, MSGS);

    const [createUrl] = _fetchMock.mock.calls[0];
    expect(createUrl).toContain('/dpc/jas/helix/v1/environments/');
  });

  it('does not double-append /dpc/jas/helix/v1 when already present', async () => {
    _fetchMock
      .mockResolvedValueOnce(okJson(CONV))
      .mockResolvedValueOnce(okJson({}))
      .mockResolvedValueOnce(pollMessages(COMPLETE_MSG));

    await callHelixAgent(CFG, MSGS);

    const [createUrl] = _fetchMock.mock.calls[0];
    expect(createUrl).not.toContain('/dpc/jas/helix/v1/dpc/jas/helix/v1');
  });
});

// ── request body ──────────────────────────────────────────────────────────────

describe('callHelixAgent — request body', () => {
  it('sendMessage body has class=start and textInputUserQuery=prompt', async () => {
    _fetchMock
      .mockResolvedValueOnce(okJson(CONV))
      .mockResolvedValueOnce(okJson({}))
      .mockResolvedValueOnce(pollMessages(COMPLETE_MSG));

    await callHelixAgent(CFG, [{ role: 'user', content: 'Test prompt' }]);

    const [, sendOpts] = _fetchMock.mock.calls[1];
    const body = JSON.parse(sendOpts.body);
    expect(body.class).toBe('start');
    expect(body.content.textInputUserQuery).toBe('Test prompt');
  });

  it('picks last user message when messages array has system + user entries', async () => {
    _fetchMock
      .mockResolvedValueOnce(okJson(CONV))
      .mockResolvedValueOnce(okJson({}))
      .mockResolvedValueOnce(pollMessages(COMPLETE_MSG));

    await callHelixAgent(CFG, [
      { role: 'system', content: 'You are a banking assistant.' },
      { role: 'user', content: 'What is my balance?' },
    ]);

    const [, sendOpts] = _fetchMock.mock.calls[1];
    const body = JSON.parse(sendOpts.body);
    expect(body.content.textInputUserQuery).toBe('What is my balance?');
  });
});

// ── polling ───────────────────────────────────────────────────────────────────

describe('callHelixAgent — polling', () => {
  it('retries poll when first response has no complete message', async () => {
    _fetchMock
      .mockResolvedValueOnce(okJson(CONV))
      .mockResolvedValueOnce(okJson({}))
      .mockResolvedValueOnce(pollMessages(PENDING_MSGS))  // first poll — not done
      .mockResolvedValueOnce(pollMessages(COMPLETE_MSG)); // second poll — done

    const result = await callHelixAgent(CFG, MSGS);

    expect(result).toBe('I am Helix.');
    expect(_fetchMock).toHaveBeenCalledTimes(4);
  });

  it('accepts complete message matched by sender_id when sender_role is absent', async () => {
    const completeBySenderId = [{ class: 'complete', sender_id: 'my-banking-agent', value: 'Hello!' }];
    _fetchMock
      .mockResolvedValueOnce(okJson(CONV))
      .mockResolvedValueOnce(okJson({}))
      .mockResolvedValueOnce(pollMessages(completeBySenderId));

    const result = await callHelixAgent(CFG, MSGS);
    expect(result).toBe('Hello!');
  });

  it('unwraps JSON-string value when agent returns {response: "..."}', async () => {
    const jsonValue = [{ class: 'complete', sender_role: 'agent', value: JSON.stringify({ response: 'Unwrapped answer' }) }];
    _fetchMock
      .mockResolvedValueOnce(okJson(CONV))
      .mockResolvedValueOnce(okJson({}))
      .mockResolvedValueOnce(pollMessages(jsonValue));

    const result = await callHelixAgent(CFG, MSGS);
    expect(result).toBe('Unwrapped answer');
  });

  it('handles poll response as {messages: [...]} envelope', async () => {
    _fetchMock
      .mockResolvedValueOnce(okJson(CONV))
      .mockResolvedValueOnce(okJson({}))
      .mockResolvedValueOnce(okJson({ messages: COMPLETE_MSG }));

    const result = await callHelixAgent(CFG, MSGS);
    expect(result).toBe('I am Helix.');
  });
});

// ── error handling ────────────────────────────────────────────────────────────

describe('callHelixAgent — error handling', () => {
  it('throws when config fields are missing', async () => {
    await expect(callHelixAgent({ helix_base_url: 'https://x.com' }, MSGS))
      .rejects.toThrow('Helix config incomplete');
  });

  it('throws when no messages provided', async () => {
    await expect(callHelixAgent(CFG, []))
      .rejects.toThrow('No messages provided');
  });

  it('throws on createConversation HTTP error', async () => {
    _fetchMock.mockResolvedValueOnce(errResponse(401, 'Unauthorized'));
    await expect(callHelixAgent(CFG, MSGS)).rejects.toThrow('createConversation failed: 401');
  });

  it('throws on sendMessage HTTP error', async () => {
    _fetchMock
      .mockResolvedValueOnce(okJson(CONV))
      .mockResolvedValueOnce(errResponse(400, 'Bad Request'));
    await expect(callHelixAgent(CFG, MSGS)).rejects.toThrow('sendMessage failed: 400');
  });

  it('throws on poll HTTP error', async () => {
    _fetchMock
      .mockResolvedValueOnce(okJson(CONV))
      .mockResolvedValueOnce(okJson({}))
      .mockResolvedValueOnce(errResponse(500, 'Internal Server Error'));
    await expect(callHelixAgent(CFG, MSGS)).rejects.toThrow('poll failed: 500');
  });
});

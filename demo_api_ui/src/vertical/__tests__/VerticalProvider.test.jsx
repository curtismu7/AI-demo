import React from 'react';
import { render, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { VerticalProvider } from '../VerticalProvider';
import { useVertical } from '../useVertical';

const BANKING = {
  id: 'banking', schemaVersion: 3,
  identity: { displayName: 'Bank' },
  theme: { cssVars: { '--x': '#000' } },
  agent: { persona: 'P' },
};
const HEALTHCARE = { ...BANKING, id: 'healthcare', identity: { displayName: 'Health' } };

function setupMocks({ user, manifest }) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      activeId: manifest.id,
      pageManifest: manifest,
      pageMockData: {},
      adminManifest: user?.role === 'admin' ? BANKING : null,
      isAdmin: user?.role === 'admin',
    }),
  });

  const handlers = {};
  class FakeES {
    constructor(url) { this.url = url; FakeES.last = this; }
    addEventListener(evt, cb) { handlers[evt] = cb; }
    close() {}
    fire(evt, data) {
      const cb = handlers[evt];
      if (cb) cb({ data: JSON.stringify(data) });
    }
  }
  global.EventSource = FakeES;
  return { FakeES, handlers };
}

function Probe() {
  const v = useVertical();
  return <div data-testid="probe">{v.pageManifest?.id}</div>;
}

describe('VerticalProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('does not render children until hydrated', async () => {
    setupMocks({ manifest: BANKING });
    const { queryByTestId, findByTestId } = render(
      <MemoryRouter><VerticalProvider><Probe /></VerticalProvider></MemoryRouter>
    );
    expect(queryByTestId('probe')).toBeNull();
    expect((await findByTestId('probe')).textContent).toBe('banking');
  });

  test('SSE vertical-switched triggers refetch', async () => {
    const { FakeES } = setupMocks({ manifest: BANKING });
    const { findByTestId } = render(
      <MemoryRouter><VerticalProvider><Probe /></VerticalProvider></MemoryRouter>
    );
    await findByTestId('probe');

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        activeId: 'healthcare',
        pageManifest: HEALTHCARE,
        pageMockData: {},
        adminManifest: null,
        isAdmin: false,
      }),
    });
    act(() => FakeES.last.fire('vertical-switched', { activeId: 'healthcare' }));

    await waitFor(() => expect(global.fetch.mock.calls.length).toBeGreaterThanOrEqual(2));
  });

  test('SSE vertical-edited triggers refetch', async () => {
    const { FakeES } = setupMocks({ manifest: BANKING });
    const { findByTestId } = render(
      <MemoryRouter><VerticalProvider><Probe /></VerticalProvider></MemoryRouter>
    );
    await findByTestId('probe');

    act(() => FakeES.last.fire('vertical-edited', { id: 'banking' }));
    await waitFor(() => expect(global.fetch.mock.calls.length).toBeGreaterThanOrEqual(2));
  });

  test('SSE vertical-list-changed dispatches window event', async () => {
    const { FakeES } = setupMocks({ manifest: BANKING });
    const { findByTestId } = render(
      <MemoryRouter><VerticalProvider><Probe /></VerticalProvider></MemoryRouter>
    );
    await findByTestId('probe');

    let received = null;
    window.addEventListener('vertical-list-changed', () => { received = true; });
    act(() => FakeES.last.fire('vertical-list-changed', { ids: ['a', 'b'] }));
    expect(received).toBe(true);
  });
});

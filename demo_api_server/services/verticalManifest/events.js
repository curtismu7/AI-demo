function createEvents({ getInitialActiveId } = {}) {
  const clients = new Set();

  function _send(res, type, payload) {
    try {
      res.write(`event: ${type}\n`);
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    } catch (_) {
      // Res may be closed; the close handler removes it.
    }
  }

  function emit(type, payload) {
    for (const res of clients) _send(res, type, payload);
  }

  function onClient(req, res) {
    if (typeof res.setHeader === 'function') {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
    }
    if (typeof res.writeHead === 'function') res.writeHead(200);
    clients.add(res);

    // Hydration: send current active id immediately so client can skip a /me round-trip.
    const initial = getInitialActiveId ? getInitialActiveId() : null;
    if (initial) _send(res, 'vertical-switched', { activeId: initial });

    // Heartbeat every 25s to keep proxies open.
    const hb = setInterval(() => {
      try { res.write(': hb\n\n'); } catch (_) { /* res closed */ }
    }, 25_000);
    if (typeof hb.unref === 'function') hb.unref();

    const cleanup = () => { clearInterval(hb); clients.delete(res); };
    if (typeof res.on === 'function') {
      res.on('close', cleanup);
      res.on('error', cleanup);
    }
  }

  function _clientCount() { return clients.size; }

  return { emit, onClient, _clientCount };
}

module.exports = { createEvents };

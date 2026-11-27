// Ignore an older HTTPS response when a live snapshot has already arrived.
export function subscribeWithFallback({ watchConnection, watchRows, read, update, fail, interval = 5000 }) {
  let active = true, connected = false, streaming = false, pending = false;
  let revision = 0, timer;
  function schedule(delay) {
    clearTimeout(timer);
    if (active && !pending && !streaming) timer = setTimeout(refresh, delay);
  }
  async function refresh() {
    if (!active || pending || streaming) return;
    pending = true;
    const start = revision;
    try {
      const rows = await read();
      if (active && revision === start) update(rows, false);
    } catch (error) {
      if (active && revision === start) fail(error);
    } finally {
      pending = false;
      schedule(interval);
    }
  }
  const stopConnection = watchConnection(online => {
    connected = online;
    if (!online) { streaming = false; schedule(0); }
  });
  const stopRows = watchRows(rows => {
    if (!active || !connected) return;
    revision++;
    streaming = true;
    clearTimeout(timer);
    update(rows, true);
  }, error => {
    if (!active) return;
    revision++;
    streaming = false;
    fail(error);
    schedule(0);
  });
  schedule(0);
  return () => { active = false; clearTimeout(timer); stopRows(); stopConnection(); };
}

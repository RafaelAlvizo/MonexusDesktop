export const desktop = window.chrome?.webview;
export function nativeAction(command, args = {}) {
  desktop?.postMessage({ command, ...args });
}

// Reserve the browser window during the click, before creating a room over the network.
export function reserveCallWindow(id, title) {
  const url = new URL(location.pathname, location.origin);
  url.search = new URLSearchParams({ window: 'meetings', room: id });
  if (desktop) return {
    open: () => nativeAction('open_window', { url: url.href, title }),
    cancel: () => {},
  };
  const child = window.open('', 'monexus-call-' + id, 'popup,width=960,height=720');
  if (!child) throw Error('Allow pop-ups for Monexus to open the call window.');
  const fresh = child.location.href === 'about:blank';
  return {
    open() {
      if (fresh) child.location.replace(url.href);
      child.focus();
    },
    cancel() { if (fresh) child.close(); },
  };
}

export const desktop = window.chrome?.webview;
export function nativeAction(command, args = {}) {
  desktop?.postMessage({ command, ...args });
}

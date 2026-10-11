export interface SocketLike {
  onopen: ((event: Event) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  close: () => void;
}
export function connectStream(
  url: string,
  handlers: {
    message: (value: unknown) => void;
    state?: (state: "connecting" | "live" | "offline") => void;
    unauthorized?: () => void;
  },
  createSocket: (url: string) => SocketLike = (url) => new WebSocket(url),
) {
  let stopped = false,
    socket: SocketLike | null = null,
    timer: ReturnType<typeof setTimeout> | null = null,
    attempt = 0;
  const connect = () => {
    if (stopped) return;
    handlers.state?.("connecting");
    try {
      socket = createSocket(url);
    } catch {
      handlers.state?.("offline");
      retry();
      return;
    }
    const current = socket;
    socket.onopen = () => {
      if (stopped || socket !== current) return;
      attempt = 0;
      handlers.state?.("live");
    };
    socket.onmessage = (e) => {
      if (stopped || socket !== current || typeof e.data !== "string") return;
      try {
        handlers.message(JSON.parse(e.data));
      } catch {
        /* Ignore malformed frames without logging private data. */
      }
    };
    socket.onerror = () => {
      if (stopped || socket !== current) return;
      current.close();
    };
    socket.onclose = (e) => {
      if (stopped || socket !== current) return;
      socket = null;
      handlers.state?.("offline");
      if (e.code === 1008 && handlers.unauthorized) {
        stopped = true;
        handlers.unauthorized?.();
        return;
      }
      retry();
    };
  };
  const retry = () => {
    if (stopped || timer) return;
    const delay = Math.min(15000, 1000 * 2 ** attempt++);
    timer = setTimeout(() => {
      timer = null;
      connect();
    }, delay);
  };
  connect();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    if (socket) {
      socket.onclose = null;
      socket.onerror = null;
      socket.onmessage = null;
      socket.onopen = null;
      socket.close();
    }
  };
}

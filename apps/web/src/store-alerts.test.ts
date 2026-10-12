import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const storage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};
vi.stubGlobal("window", { localStorage: storage });
const { useStore } = await import("./store");
const original = {
  id: "alert-1",
  symbol: "BTCUSDT" as const,
  price: 67500,
  enabled: true,
  fired: false,
};

beforeEach(() => {
  useStore.setState({
    demo: false,
    authenticated: true,
    alerts: [{ ...original }],
    notice: null,
  });
  vi.useFakeTimers();
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
afterAll(() =>
  useStore.setState({ authenticated: false, alerts: [], notice: null }),
);

describe("alert edits in the store", () => {
  it("keeps demo changes local", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    useStore.setState({ demo: true, authenticated: false });
    await useStore.getState().updateAlert(original.id, 68000);
    expect(fetch).not.toHaveBeenCalled();
    expect(useStore.getState().alerts).toEqual([{ ...original, price: 68000 }]);
  });

  it("preserves the old level when the server rejects a raced edit", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "Alert already fired" }), {
          status: 409,
        }),
      ),
    );
    await expect(
      useStore.getState().updateAlert(original.id, 68000),
    ).rejects.toThrow("Alert already fired");
    expect(useStore.getState().alerts).toEqual([original]);
  });

  it.each(["logout", "demo"])(
    "does not restore private alerts when %s occurs during a save",
    async (transition) => {
      let resolve!: (response: Response) => void;
      vi.stubGlobal(
        "fetch",
        vi.fn(
          () =>
            new Promise<Response>((accept) => {
              resolve = accept;
            }),
        ),
      );
      const pending = useStore.getState().updateAlert(original.id, 68000);
      useStore.getState().exit();
      if (transition === "demo") useStore.getState().enterDemo();
      resolve(new Response(JSON.stringify({ ...original, price: 68000 })));
      await pending;
      expect(useStore.getState().alerts).toEqual([]);
    },
  );

  it("does not resurrect an alert removed during a pending save", async () => {
    let resolve!: (response: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((accept) => {
            resolve = accept;
          }),
      ),
    );
    const pending = useStore.getState().updateAlert(original.id, 68000);
    useStore.setState({ alerts: [] });
    resolve(new Response(JSON.stringify({ ...original, price: 68000 })));
    await pending;
    expect(useStore.getState().alerts).toEqual([]);
  });
});

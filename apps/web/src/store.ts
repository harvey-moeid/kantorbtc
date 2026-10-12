import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  defaultSettings,
  type Settings,
  type Signal,
  type Quote,
  type Meeting,
} from "../../../packages/shared/src/domain";
import {
  demoSignals,
  demoQuotes,
  demoMeetings,
} from "../../../packages/shared/src/demo";
import type { MeetingEvent } from "../../../packages/shared/src/presentation";
export interface PriceAlert {
  id: string;
  symbol: "BTCUSDT" | "XAUUSD";
  price: number;
  enabled: boolean;
  fired?: boolean;
}
interface State {
  demo: boolean;
  authenticated: boolean;
  publicView: boolean;
  mood: "naik" | "turun" | "tenang";
  meetingPhase: string;
  meetingEvent: MeetingEvent | null;
  settings: Settings;
  signals: Signal[];
  quotes: Quote[];
  meetings: Meeting[];
  alerts: PriceAlert[];
  selectedStaff: string | null;
  floor: "all" | "1" | "2";
  mode2d: boolean;
  notice: string | null;
  connection: "demo" | "connecting" | "live" | "offline";
  enterDemo: () => void;
  exit: () => void;
  set: (values: Partial<State>) => void;
  notify: (text: string) => void;
  saveSettings: (s: Settings) => Promise<void>;
  addAlert: (a: Omit<PriceAlert, "id" | "enabled">) => Promise<void>;
  updateAlert: (id: string, price: number) => Promise<void>;
}
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const data = await res
    .json()
    .catch(() => ({ error: `Server HTTP ${res.status}` }));
  if (!res.ok)
    throw new ApiError(
      (data as { error?: string }).error || `HTTP ${res.status}`,
      res.status,
    );
  return data as T;
}
export const useStore = create<State>()(
  persist(
    (set, get) => ({
      demo: false,
      authenticated: false,
      publicView: true,
      mood: "tenang",
      meetingPhase: "idle",
      meetingEvent: null,
      settings: defaultSettings,
      signals: [],
      quotes: [],
      meetings: [],
      alerts: [],
      selectedStaff: null,
      floor: "all",
      mode2d: false,
      notice: null,
      connection: "offline",
      set: (values) => set(values),
      notify: (notice) => {
        set({ notice });
        setTimeout(() => set({ notice: null }), 5000);
      },
      enterDemo: () =>
        set({
          demo: true,
          publicView: false,
          authenticated: false,
          connection: "demo",
          meetingEvent: null,
          meetingPhase: "idle",
          signals: structuredClone(demoSignals),
          quotes: structuredClone(demoQuotes),
          meetings: structuredClone(demoMeetings),
        }),
      exit: () =>
        set({
          demo: false,
          authenticated: false,
          publicView: true,
          signals: [],
          quotes: [],
          meetings: [],
          alerts: [],
          connection: "offline",
          meetingEvent: null,
          meetingPhase: "idle",
          selectedStaff: null,
        }),
      saveSettings: async (settings) => {
        if (!get().demo)
          await api("/settings/scanner", {
            method: "PUT",
            body: JSON.stringify(settings),
          });
        set({ settings });
        get().notify(
          get().demo
            ? "Pengaturan demo disimpan di perangkat ini."
            : "Pengaturan disimpan; berlaku pada putaran scanner berikutnya.",
        );
      },
      addAlert: async (input) => {
        let alert: PriceAlert = {
          ...input,
          id: crypto.randomUUID(),
          enabled: true,
        };
        if (!get().demo)
          alert = await api<PriceAlert>("/alerts", {
            method: "POST",
            body: JSON.stringify(input),
          });
        set((s) => ({ alerts: [...s.alerts, alert] }));
        get().notify(
          get().demo
            ? "Alert demo dibuat. Pengiriman Discord tidak aktif dalam demo."
            : "Alert harga dibuat.",
        );
      },
      updateAlert: async (id, price) => {
        const existing = get().alerts.find((alert) => alert.id === id);
        if (!existing || !existing.enabled || existing.fired)
          throw new Error("Alert terpicu atau nonaktif tidak dapat diubah.");
        if (!Number.isFinite(price) || price <= 0)
          throw new Error("Masukkan harga yang valid.");
        const demo = get().demo;
        const alert = demo
          ? { ...existing, price }
          : await api<PriceAlert>(`/alerts/${encodeURIComponent(id)}`, {
              method: "PATCH",
              body: JSON.stringify({ price }),
            });
        // A pending private request must not restore alerts after logout or
        // overwrite the state of a newly entered demo.
        if (get().demo !== demo || (!demo && !get().authenticated)) return;
        set((s) => ({
          alerts: s.alerts.map((item) => (item.id === id ? alert : item)),
        }));
        get().notify(
          get().settings.language === "en"
            ? "Price alert updated."
            : "Alert harga diperbarui.",
        );
      },
    }),
    {
      name: "kantor-preferences-v1",
      partialize: (s) => ({ settings: s.settings, mode2d: s.mode2d }),
    },
  ),
);

import { useEffect, useState } from "react";
import {
  Activity,
  Bell,
  Check,
  Database,
  ChevronRight,
  LockKeyhole,
  Monitor,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import {
  defaultSettings,
  groupNames,
  staff,
  staffName,
  timeframes,
  settingsSchema,
  type Settings,
} from "../../../../packages/shared/src/domain";
import { api, useStore } from "../store";
import { useT } from "../i18n";
import { Badge, Modal, PageTitle } from "../components/UI";
import DataOperations from "../components/DataOperations";
import {
  providerModels,
  defaultAISlots,
} from "../../../../packages/shared/src/ai-models";
export const providers = [
  "Workers AI",
  "Gemini",
  "Groq",
  "OpenRouter",
  "Mistral",
  "Hugging Face",
  "Cohere",
  "NVIDIA",
  "OANDA",
  "Twelve Data",
  "Discord",
];
export default function SettingsPage() {
  const current = useStore((s) => s.settings),
    demo = useStore((s) => s.demo),
    mode2d = useStore((s) => s.mode2d),
    [form, setForm] = useState<Settings>(structuredClone(current)),
    [tab, setTab] = useState("general"),
    [busy, setBusy] = useState(false),
    [workersAI, setWorkersAI] = useState(false),
    [credentials, setCredentials] = useState<
      {
        provider: string;
        last4: string;
        enabled: number;
        test_status?: string;
      }[]
    >([]),
    [provider, setProvider] = useState(""),
    [keyValue, setKeyValue] = useState(""),
    [slotModels, setSlotModels] = useState(() =>
      structuredClone(demo ? useStore.getState().demoAISlots : defaultAISlots),
    ),
    t = useT();
  useEffect(() => {
    if (!demo) {
      api<{ credentials: typeof credentials; workersAI: boolean }>(
        "/settings/api",
      )
        .then((d) => {
          setCredentials(d.credentials);
          setWorkersAI(d.workersAI);
        })
        .catch((e) => useStore.getState().notify(e.message));
      api<{ slots: typeof slotModels }>("/settings/ai")
        .then((d) => setSlotModels(d.slots))
        .catch(() => {});
    }
  }, [demo]);
  const save = async () => {
    setBusy(true);
    try {
      const parsed = settingsSchema.safeParse(form);
      if (!parsed.success)
        throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
      await useStore.getState().saveSettings(parsed.data);
    } catch (e) {
      useStore.getState().notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const secretSave = async () => {
    setBusy(true);
    try {
      if (demo)
        throw new Error(
          "Demo tidak menerima kredensial. Login ke backend terlebih dahulu.",
        );
      await api(`/settings/api/${encodeURIComponent(provider)}`, {
        method: "PUT",
        body: JSON.stringify({ value: keyValue }),
      });
      setKeyValue("");
      setProvider("");
      const d = await api<{ credentials: typeof credentials }>("/settings/api");
      setCredentials(d.credentials);
      useStore.getState().notify("Kredensial terenkripsi dan tersimpan di D1.");
    } catch (e) {
      useStore.getState().notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageTitle
        eyebrow="DIRECTOR'S OFFICE"
        title={t.settings}
        description="Kontrol scanner, tim AI, kualitas kantor, dan koneksi provider."
      />
      <div className="settings-layout">
        <nav className="settings-nav">
          {[
            ["general", Monitor, "Umum & tampilan"],
            ["scanner", Activity, "Scanner & risiko"],
            ["ai", Sparkles, "Susunan AI"],
            ["api", LockKeyhole, "Koneksi API"],
            ["data", Database, "Histori & backfill"],
            ["alerts", Bell, "Alert Discord"],
          ].map(([id, Icon, label]) => {
            const I = Icon as typeof Monitor;
            return (
              <button
                key={String(id)}
                className={tab === id ? "active" : ""}
                onClick={() => setTab(String(id))}
              >
                <I size={17} />
                {String(label)}
                <ChevronRight size={14} />
              </button>
            );
          })}
        </nav>
        <section className="panel settings-content">
          {tab === "general" && (
            <>
              <SettingsTitle
                title="Umum & tampilan"
                description="Sesuaikan kantor dengan perangkat dan preferensi Anda."
              />
              <h3>Nama karakter</h3>
              <p>
                Nama tampil di kantor 3D, daftar tim, dan presentasi. Maksimal
                32 karakter.
              </p>
              <div className="form-grid">
                {staff.map((person) => (
                  <label className="form-field" key={person.id}>
                    {person.role}
                    <input
                      aria-label={`Nama ${person.name}`}
                      maxLength={32}
                      value={form.staffNames?.[person.id] ?? person.name}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          staffNames: {
                            ...form.staffNames,
                            [person.id]: e.target.value,
                          },
                        })
                      }
                    />
                  </label>
                ))}
              </div>
              <label className="settings-row">
                <div>
                  <b>Bahasa antarmuka</b>
                  <p>Indonesia sebagai bahasa default.</p>
                </div>
                <select
                  value={form.language}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      language: e.target.value as "id" | "en",
                    })
                  }
                >
                  <option value="id">Bahasa Indonesia</option>
                  <option value="en">English</option>
                </select>
              </label>
              <label className="settings-row">
                <div>
                  <b>Profil kualitas 3D</b>
                  <p>Low membatasi resolusi; High mengaktifkan bayangan.</p>
                </div>
                <select
                  value={form.quality}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      quality: e.target.value as Settings["quality"],
                    })
                  }
                >
                  {["auto", "low", "medium", "high"].map((q) => (
                    <option key={q} value={q}>
                      {q.toUpperCase()}
                    </option>
                  ))}
                </select>
              </label>
              <label className="settings-row">
                <div>
                  <b>Mode non-3D</b>
                  <p>Chart dan analisis tetap tersedia tanpa WebGL.</p>
                </div>
                <input
                  className="toggle"
                  type="checkbox"
                  checked={mode2d}
                  onChange={(e) =>
                    useStore.getState().set({ mode2d: e.target.checked })
                  }
                />
              </label>
              <div className="callout">
                Suara ambient belum disertakan. Default kantor tetap senyap.
              </div>
            </>
          )}
          {tab === "scanner" && (
            <>
              <SettingsTitle
                title="Scanner & manajemen risiko"
                description="Empat kelompok dievaluasi pada candle yang sudah close."
              />
              <div className="callout">
                Voting memerlukan 3 dari 4 AI searah. Seri 2–2 hanya lolos jika
                jumlah kelompok scanner pendukung lebih banyak, minimal kelompok
                terpenuhi, dan selisih total skornya mencapai margin.
                Rekomendasi: margin 30 poin; TTL 5m = 30 menit, 15m = 90 menit,
                H1 = 6 jam, H4 = 24 jam, D1 = 5 hari. Nilai dapat Anda ubah.
                Kosongkan margin untuk menonaktifkan tie-breaker; kosongkan TTL
                untuk menonaktifkan penerbitan sinyal pada timeframe tersebut.
              </div>
              <button
                type="button"
                className="button secondary"
                onClick={() =>
                  setForm({
                    ...form,
                    tieMargin: defaultSettings.tieMargin,
                    ttl: { ...defaultSettings.ttl },
                  })
                }
              >
                Gunakan rekomendasi TTL & voting
              </button>
              <p>Perubahan diterapkan setelah Anda menekan Simpan.</p>
              {(Object.keys(groupNames) as (keyof typeof groupNames)[]).map(
                (g) => (
                  <label className="settings-row" key={g}>
                    <div>
                      <b>{groupNames[g]}</b>
                      <p>Aktifkan kelompok dan tentukan ambang skor.</p>
                    </div>
                    <div className="setting-controls">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        aria-label={`Ambang ${groupNames[g]}`}
                        value={form.thresholds[g]}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            thresholds: {
                              ...form.thresholds,
                              [g]: Number(e.target.value),
                            },
                          })
                        }
                      />
                      <input
                        className="toggle"
                        type="checkbox"
                        checked={form.enabled[g]}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            enabled: { ...form.enabled, [g]: e.target.checked },
                          })
                        }
                      />
                    </div>
                  </label>
                ),
              )}
              <NumberSetting
                label="Minimum kelompok searah"
                hint="Default 2; minimal 2, maksimal 4."
                value={form.minGroups}
                min={2}
                max={4}
                onChange={(v) => setForm({ ...form, minGroups: v })}
              />
              <NumberSetting
                label="Minimum RR pada TP1"
                hint="Menggunakan entry terburuk untuk zona entry."
                value={form.minRR}
                min={1}
                max={10}
                step={0.1}
                onChange={(v) => setForm({ ...form, minRR: v })}
              />
              <label className="settings-row">
                <div>
                  <b>Margin total skor tie-breaker</b>
                  <p>
                    Selisih total skor pendukung dan lawan; default 30 poin.
                    Kosong = nonaktif.
                  </p>
                </div>
                <input
                  type="number"
                  min="0"
                  max="400"
                  value={form.tieMargin ?? ""}
                  placeholder="Belum dipilih"
                  onChange={(e) =>
                    setForm({
                      ...form,
                      tieMargin:
                        e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                />
              </label>
              <h3>Strategi scanner</h3>
              <p>
                Aturan ini digunakan pada candle close berikutnya setelah
                disimpan.
              </p>
              <label className="settings-row">
                <div>
                  <b>Strategi SMC / ICT</b>
                  <p>
                    Pilih breakout struktur, liquidity sweep, atau keduanya.
                  </p>
                </div>
                <select
                  aria-label="Strategi SMC"
                  value={form.strategy.smcMode}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      strategy: {
                        ...form.strategy,
                        smcMode: e.target
                          .value as Settings["strategy"]["smcMode"],
                      },
                    })
                  }
                >
                  <option value="both">Breakout + liquidity sweep</option>
                  <option value="breakout">Breakout struktur</option>
                  <option value="sweep">Liquidity sweep</option>
                </select>
              </label>
              {(
                [
                  [
                    "rsiLower",
                    "Batas bawah RSI short",
                    "Short membutuhkan RSI di atas batas ini dan di bawah 50.",
                    0,
                    49,
                    1,
                  ],
                  [
                    "rsiUpper",
                    "Batas atas RSI long",
                    "Long membutuhkan RSI di atas 50 dan di bawah batas ini.",
                    51,
                    100,
                    1,
                  ],
                  [
                    "volumeRatio",
                    "Rasio minimum volume",
                    "Volume candle dibanding rata-rata volume swing.",
                    0.1,
                    10,
                    0.05,
                  ],
                  [
                    "oiChange",
                    "Minimum perubahan open interest",
                    "Rasio perubahan OI; 0.01 berarti 1%.",
                    0,
                    1,
                    0.005,
                  ],
                ] as const
              ).map(([key, label, hint, min, max, step]) => (
                <NumberSetting
                  key={key}
                  label={label}
                  hint={hint}
                  min={min}
                  max={max}
                  step={step}
                  value={form.strategy[key]}
                  onChange={(v) =>
                    setForm({
                      ...form,
                      strategy: { ...form.strategy, [key]: v },
                    })
                  }
                />
              ))}
              <h3>Parameter indikator</h3>
              <div className="form-grid">
                {(["emaFast", "emaSlow", "rsiPeriod", "swing"] as const).map(
                  (k) => (
                    <label className="form-field" key={k}>
                      {
                        {
                          emaFast: "EMA cepat",
                          emaSlow: "EMA lambat",
                          rsiPeriod: "Periode RSI",
                          swing: "Sensitivitas swing",
                        }[k]
                      }
                      <input
                        type="number"
                        value={form[k]}
                        onChange={(e) =>
                          setForm({ ...form, [k]: Number(e.target.value) })
                        }
                      />
                    </label>
                  ),
                )}
              </div>
              <h3>Masa berlaku sinyal (menit)</h3>
              <p>
                TTL dihitung sejak sinyal dibuat, tetap berjalan setelah entry
                dan saat pasar tutup. Sinyal yang belum selesai menjadi
                kedaluwarsa ketika TTL habis. Mengubah TTL tidak mengubah sinyal
                yang sudah terbit.
              </p>
              <div className="form-grid">
                {timeframes.map((tf) => (
                  <label className="form-field" key={tf}>
                    {tf}
                    <input
                      type="number"
                      min={
                        { "5m": 5, "15m": 15, H1: 60, H4: 240, D1: 1440 }[tf]
                      }
                      step={1}
                      placeholder="Nonaktif"
                      value={form.ttl[tf] === null ? "" : form.ttl[tf]! / 60}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          ttl: {
                            ...form.ttl,
                            [tf]:
                              e.target.value === ""
                                ? null
                                : Number(e.target.value) * 60,
                          },
                        })
                      }
                    />
                  </label>
                ))}
              </div>
            </>
          )}
          {tab === "ai" && (
            <>
              <SettingsTitle
                title="Empat slot voting AI"
                description="Analisis dijalankan paralel; presentasi menggunakan hasil yang sama."
              />
              <div className="callout">
                Provider perlu kredensial aktif. Jika slot gagal setelah satu
                retry, hasilnya abstain. Tanpa kuorum tidak ada sinyal.
              </div>
              <p>
                Daftar model adalah saran, bukan pemeriksaan ketersediaan akun.
                Anda juga dapat memasukkan ID model kustom.
              </p>
              {slotModels.map((slot, i) => (
                <div className="ai-slot" key={i}>
                  <span
                    className="avatar"
                    style={
                      {
                        "--avatar-color": staff[i + 4].color,
                      } as React.CSSProperties
                    }
                  >
                    {staffName(staff[i + 4], current)[0]}
                  </span>
                  <div>
                    <b>
                      Slot {i + 1} · {staffName(staff[i + 4], current)}
                    </b>
                    <div className="form-grid">
                      <select
                        aria-label={`Provider slot ${i + 1}`}
                        value={slot.provider}
                        onChange={(e) =>
                          setSlotModels(
                            slotModels.map((s, j) =>
                              j === i
                                ? {
                                    provider: e.target.value,
                                    model: providerModels[e.target.value][0],
                                  }
                                : s,
                            ),
                          )
                        }
                      >
                        {providers.slice(0, 8).map((p) => (
                          <option key={p}>{p}</option>
                        ))}
                      </select>
                      <select
                        aria-label={`Pilihan model slot ${i + 1}`}
                        value={
                          providerModels[slot.provider]?.includes(slot.model)
                            ? slot.model
                            : "custom"
                        }
                        onChange={(e) =>
                          setSlotModels(
                            slotModels.map((s, j) =>
                              j === i
                                ? {
                                    ...s,
                                    model:
                                      e.target.value === "custom"
                                        ? ""
                                        : e.target.value,
                                  }
                                : s,
                            ),
                          )
                        }
                      >
                        {(providerModels[slot.provider] || []).map((model) => (
                          <option key={model} value={model}>
                            {model}
                          </option>
                        ))}
                        <option value="custom">Model kustom…</option>
                      </select>
                      <input
                        placeholder="ID model dari provider"
                        aria-label={`Model slot ${i + 1}`}
                        value={slot.model}
                        onChange={(e) =>
                          setSlotModels(
                            slotModels.map((s, j) =>
                              j === i ? { ...s, model: e.target.value } : s,
                            ),
                          )
                        }
                      />
                    </div>
                  </div>
                </div>
              ))}
              <button
                className="button primary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const slots = slotModels.map((slot) => ({
                      ...slot,
                      model: slot.model.trim(),
                    }));
                    if (
                      slots.some(
                        (slot) => !slot.model || slot.model.length > 160,
                      )
                    )
                      throw new Error(
                        "Isi ID model untuk keempat slot (maksimal 160 karakter).",
                      );
                    if (demo) {
                      useStore.getState().set({ demoAISlots: slots });
                      useStore
                        .getState()
                        .notify(
                          "Susunan AI demo disimpan di perangkat ini; tidak menjalankan provider live.",
                        );
                      return;
                    }
                    await api("/settings/ai", {
                      method: "PUT",
                      body: JSON.stringify({ slots }),
                    });
                    useStore.getState().notify("Empat slot AI disimpan.");
                  } catch (e) {
                    useStore.getState().notify((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Simpan susunan AI
              </button>
            </>
          )}
          {tab === "api" && (
            <>
              <SettingsTitle
                title="Koneksi API"
                description="Kredensial dienkripsi AES-GCM di backend. UI hanya membaca empat karakter terakhir."
              />
              {demo && (
                <div className="callout">
                  Mode demo tidak menyimpan API key. Login ke backend
                  terkonfigurasi untuk mengaktifkan integrasi.
                </div>
              )}
              <div className="provider-list">
                {providers.map((p) => {
                  const credential = credentials.find((c) => c.provider === p);
                  const aiActive = p === "Workers AI" && workersAI && !demo;
                  return (
                    <div key={p}>
                      <span className="provider-letter">
                        {p === "Workers AI" ? <Sparkles size={18} /> : p[0]}
                      </span>
                      <div>
                        <b>{p}</b>
                        <small>
                          {p === "Workers AI"
                            ? demo
                              ? "Binding tidak diperiksa dalam demo"
                              : workersAI
                                ? "Binding Cloudflare AI tersedia"
                                : "Binding AI belum terpasang pada Worker"
                            : credential
                              ? `••••${credential.last4}`
                              : "Belum terhubung"}
                        </small>
                      </div>
                      <Badge tone={aiActive || credential ? "green" : ""}>
                        {aiActive
                          ? "TERKONFIGURASI"
                          : credential?.test_status === "valid"
                            ? "VALID"
                            : credential?.test_status === "failed"
                              ? "GAGAL"
                              : credential
                                ? "TERKONFIGURASI"
                                : "BELUM AKTIF"}
                      </Badge>
                      {(credential || aiActive) && (
                        <button
                          className="text-button"
                          disabled={busy}
                          onClick={async () => {
                            setBusy(true);
                            try {
                              const result = await api<{ message: string }>(
                                `/settings/api/${encodeURIComponent(p)}/test`,
                                { method: "POST" },
                              );
                              useStore.getState().notify(result.message);
                              const d = await api<{
                                credentials: typeof credentials;
                              }>("/settings/api");
                              setCredentials(d.credentials);
                            } catch (e) {
                              useStore.getState().notify((e as Error).message);
                            } finally {
                              setBusy(false);
                            }
                          }}
                        >
                          Tes
                        </button>
                      )}
                      {p !== "Workers AI" && (
                        <button
                          className="button secondary small"
                          disabled={demo}
                          onClick={() => setProvider(p)}
                        >
                          {credential ? "Ganti key" : "Hubungkan"}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="callout">
                OKX → Binance → Bybit tersedia untuk candle BTC. Emas memerlukan
                OANDA atau Twelve Data. Workers AI memerlukan binding AI di
                Cloudflare.
              </div>
            </>
          )}
          {tab === "data" && <DataOperations />}
          {tab === "alerts" && (
            <>
              <SettingsTitle
                title="Alert Discord"
                description="Satu channel untuk sinyal dan sentuhan harga."
              />
              {[
                [
                  "discordSignals",
                  "Sinyal disetujui",
                  "Kirim ringkasan entry, SL, TP dan RR.",
                ],
                [
                  "discordPrices",
                  "Alert harga",
                  "Kirim ketika tick melintasi level yang Anda tentukan.",
                ],
              ].map(([k, l, h]) => (
                <label className="settings-row" key={k}>
                  <div>
                    <b>{l}</b>
                    <p>{h}</p>
                  </div>
                  <input
                    className="toggle"
                    type="checkbox"
                    checked={form[k as "discordSignals" | "discordPrices"]}
                    onChange={(e) =>
                      setForm({ ...form, [k]: e.target.checked })
                    }
                  />
                </label>
              ))}
              <NumberSetting
                label="Cooldown alert (detik)"
                hint="Mencegah pengiriman berulang dalam waktu singkat."
                value={form.cooldown}
                min={0}
                max={86400}
                onChange={(v) => setForm({ ...form, cooldown: v })}
              />
              <div className="callout">
                Webhook diatur pada tab Koneksi API. Mode demo tidak mengirim
                pesan eksternal. Outbox D1 menyimpan status pengiriman dan
                mencoba ulang saat gagal.
              </div>
            </>
          )}
          {!["api", "ai", "data"].includes(tab) && (
            <div className="settings-save">
              <button
                className="text-button"
                onClick={() => setForm(structuredClone(defaultSettings))}
              >
                <RotateCcw size={14} />
                {t.reset}
              </button>
              <button className="button primary" onClick={save} disabled={busy}>
                <Check size={16} />
                {busy ? "Menyimpan…" : t.save}
              </button>
            </div>
          )}
        </section>
      </div>
      {provider && (
        <Modal
          title={`Hubungkan ${provider}`}
          onClose={() => {
            setProvider("");
            setKeyValue("");
          }}
        >
          <p className="muted">
            Nilai hanya dikirim ke backend dan tidak pernah dikembalikan ke
            browser.
          </p>
          <label className="form-field">
            {provider === "Discord" ? "Webhook URL" : "API key"}
            <input
              type="password"
              autoComplete="new-password"
              value={keyValue}
              onChange={(e) => setKeyValue(e.target.value)}
              autoFocus
            />
          </label>
          <button
            className="button primary wide"
            onClick={secretSave}
            disabled={!keyValue || busy}
          >
            {busy ? "Menyimpan…" : "Enkripsi & simpan"}
          </button>
        </Modal>
      )}
    </>
  );
}
function SettingsTitle({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="settings-title">
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  );
}
function NumberSetting({
  label,
  hint,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="settings-row">
      <div>
        <b>{label}</b>
        <p>{hint}</p>
      </div>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

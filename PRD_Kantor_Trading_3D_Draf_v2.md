# PRD — Kantor Trading 3D (BTCUSDT & XAUUSD)

_Draf v2 · 11 Oktober 2026 · Diperbarui 12 Oktober 2026: implementasi dilanjutkan; keputusan lanjutan pada 20.11–20.12 dikonfirmasi; rincian yang tersisa tercantum pada bagian 21._

> **Aturan pembacaan dokumen:** Bagian **20 — Keputusan Terkonfirmasi** adalah revisi terbaru hasil tanya jawab dan **menggantikan ketentuan lama yang bertentangan** pada bagian 1–19. Teks awal dipertahankan sebagai jejak spesifikasi agar tidak ada keputusan atau detail lama yang hilang. Butir pada **bagian 21** belum diputuskan dan tidak boleh dianggap final.

## 1. Ringkasan

Aplikasi web mobile-first yang menampilkan pasar **BTCUSDT** dan **XAUUSD** dalam bentuk **kantor 3D interaktif**. Di dalam kantor ada 10+ karyawan 3D: sebagian bertugas sebagai **analis** (menampilkan sinyal dan analisis), sebagian lagi **bereaksi terhadap pergerakan harga** lewat animasi. Layar-layar trading di kantor menampilkan harga dan chart realtime. Sinyal dihasilkan oleh **scanner rule-based 4 kelompok** di Worker, lalu dianalisis oleh **LLM** lewat voting 4 model AI (meeting) ketika minimal 2 dari 4 kelompok scanner (SMC/ICT, indikator, volume, derivatives) searah. Sistem ini **hanya sinyal dan log, tanpa eksekusi order**. Alert dikirim ke **Discord**.

**Keputusan kunci (hasil tanya jawab):**

- Tujuan: monitoring harga & chart + analisis (indikator, sinyal, AI)
- Device utama: HP (mobile web), kualitas adaptif untuk device lebih lemah
- Visual: kantor 3D semi-realistis, engine React Three Fiber
- Hosting & backend: Cloudflare (Pages, Workers, Durable Objects)
- Data: satu sumber utama per aset + fallback. BTC utama OKX, emas utama OANDA
- Timeframe: 5m, 15m, H1, H4, D1
- Akses: login sederhana
- Cakupan awal: hanya BTCUSDT dan XAUUSD

## 2. Tujuan dan Non-Tujuan

**Tujuan**

1. Pengguna bisa memantau harga dan chart BTCUSDT/XAUUSD dalam pengalaman 3D yang menarik, berjalan mulus di HP.
2. Pengguna mendapat sinyal terstruktur (arah, level, alasan) dari scanner 4 kelompok dan voting 4 model AI.
3. Pengguna menerima alert harga dan sinyal di Discord.
4. Data tetap tersedia ketika sumber utama gagal (fallback otomatis).

**Non-tujuan (versi awal)**

- Tidak ada eksekusi order, paper trading, atau koneksi ke akun broker/exchange.
- Tidak ada pair selain BTCUSDT dan XAUUSD.
- Tidak ada mode VR/AR.
- Bukan nasihat keuangan. Semua sinyal bersifat informasi.

## 3. Pengguna dan Akses

- **Pengguna utama:** trader/pemilik app yang ingin memantau dua aset dengan tampilan visual.
- **Login sederhana:** satu password saja tanpa username (hash di D1), sesi via cookie httpOnly. Aplikasi dipakai satu pengguna (pemilik), jadi tidak ada multi-user atau peran.
- Halaman publik berisi login, landing singkat, dan tampilan kantor 3D read-only (bagian 10.6). Data pasar dan sinyal rinci tetap di balik login.

## 4. Cakupan MVP

| Area          | Termasuk MVP                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------------ |
| Data pasar    | Harga realtime + candle 5m/15m/H1/H4/D1 untuk 2 aset                                             |
| Scanner       | 4 kelompok (SMC/ICT, indikator, volume, derivatives) per timeframe, suara arah + skor            |
| Meeting AI    | Meeting: voting 4 model AI saat ≥ 2 kelompok searah                                              |
| Kantor 3D     | 1 scene kantor, 10+ karyawan, layar trading, kamera orbit                                        |
| Interaksi     | Klik karyawan → analisis, klik layar → halaman chart sendiri                                     |
| Alert         | Discord (webhook)                                                                                |
| Log           | Riwayat sinyal dan analisis di D1                                                                |
| Performa      | Kualitas adaptif (Low/Med/High)                                                                  |
| Halaman chart | Halaman sendiri: candlestick realtime, indikator, zona SMC/ICT, penanda sinyal, alert dari chart |

## 5. Sumber Data dan Fallback

| Aset    | Utama | Fallback (urutan) |
| ------- | ----- | ----------------- |
| BTCUSDT | OKX   | Binance → Bybit   |
| XAUUSD  | OANDA | Twelve Data       |

**Data proxy emas untuk kelompok derivatives dan volume (rekomendasi):**

- **Utama:** perpetual XAUUSDT di Binance, Bybit, dan OKX: funding rate, open interest, dan volume. Exchange-nya sama dengan yang dipakai untuk BTC, datanya publik, dan berlaku prinsip satu sumber utama + fallback antar ketiganya.
- **Pelengkap:** laporan COT dari CFTC (rilis mingguan). Dipakai sebagai konteks posisi pelaku besar dengan bobot rendah, bukan pemicu realtime.
- **Tidak masuk MVP:** data futures emas langsung dari bursa berjangka, karena data realtime-nya umumnya berbayar.
- **Catatan:** harga perpetual di exchange crypto bisa berbeda dari spot OANDA dan punya funding sendiri. Karena itu dipakai sebagai sinyal posisi pasar, bukan harga acuan.
- **Sebelum implementasi:** pastikan kontrak XAUUSDT tersedia di tiap exchange dan cek field API-nya (funding, open interest, volume).

**Pengisian data awal dan pembaruan berkala:**

- **Deploy pertama:** backfill candle 1 tahun terakhir untuk BTCUSDT dan XAUUSD di 5 timeframe (5m, 15m, H1, H4, D1) dari sumber utama (OKX, OANDA), dengan fallback bila gagal.
- **Setelah itu:** pembaruan terjadwal tiap 5 menit (Cron Trigger) yang mengambil candle baru dan menyimpannya, sejajar dengan meeting scanner. Penyimpanan bersifat upsert dengan kunci (symbol, tf, waktu), jadi aman diulang.
- **Backfill bertahap:** berjalan per potongan waktu lewat Queue atau Workflow, bisa dilanjutkan bila terputus, progresnya terlihat di panel pengaturan. Tersedia tombol "Backfill ulang" manual untuk rentang tertentu.
- **Perkiraan volume:** sekitar 105 ribu candle 5m per aset untuk satu tahun, total sekitar 150 ribu baris per aset di kelima timeframe. Karena candle disimpan tanpa batas, tambahannya sebesar itu per aset tiap tahun, jadi ukuran D1 perlu dipantau.
- **Celah data:** bila satu pembaruan terlewat, pembaruan berikutnya mengisi celah dari candle terakhir yang tersimpan.
- **Catatan:** tiap provider membatasi jumlah candle per request dan kuota, jadi backfill perlu paginasi dan pengaturan laju. Riwayat funding rate dan open interest dari exchange sering lebih pendek dari satu tahun, jadi kelompok derivatives dimulai dari data yang tersedia.

**Prinsip**

- Hanya **satu sumber aktif per aset** pada satu waktu. Sumber lain standby.
- **Failover otomatis** bila: koneksi WebSocket putus lebih dari 10 detik dan gagal tersambung ulang, tidak ada tick lebih dari 15 detik (BTC) atau 30 detik (XAUUSD saat pasar buka), atau error/rate limit berulang. Pindah ke fallback berikutnya, kembali ke utama setelah stabil (sumber utama harus stabil 2 menit agar tidak bolak-balik).
- UI menampilkan **badge sumber aktif** dan status (live / fallback / stale).
- Semua data dinormalisasi ke satu format internal: `{symbol, tf, t, o, h, l, c, v, source}`.
- **Catatan teknis:** OKX/Binance/Bybit menyediakan WebSocket publik untuk crypto. Untuk emas, OANDA dan Twelve Data biasanya memerlukan API key/akun dan punya batas rate/kuota. Cek kuota plan sebelum implementasi karena menentukan frekuensi polling vs streaming.
- **Perbedaan harga antar sumber:** BTCUSDT dari exchange berbeda sedikit berbeda, begitu juga XAUUSD dari broker berbeda. Saat failover, tandai di log agar candle yang bersambung tidak disalahartikan sebagai gap pasar.

**Jam pasar XAUUSD:** emas spot tutup di akhir pekan dan ada jeda harian, jadi tidak adanya tick pada jam tutup bukan gangguan. Di luar jam pasar tidak ada failover, status ditampilkan "pasar tutup", dan scanner untuk XAUUSD dilewati (usulan). Jam buka dan tutup diambil dari sumber data atau jadwal di konfigurasi. Ambang failover di atas adalah nilai awal (usulan) dan bisa diubah di UI.

## 6. Arsitektur (Cloudflare)

```
Exchange/Broker ──WS/REST──► Durable Object: MarketHub (1 per aset)
                                 │  normalisasi, failover, bentuk candle
                                 ├─► WebSocket ke klien (tick + candle)
                                 ├─► Scanner (4 kelompok)
                                 │      └─► kandidat sinyal ─► Meeting 4 AI ─► D1 (sinyal + log)
                                 │                                      └─► Discord webhook
                                 └─► KV/D1: cache candle historis
Pages (React + R3F) ◄── Workers API (Hono) ◄── D1 / KV
```

| Komponen                                                                                      | Fungsi                                                                                                                                          |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Pages**                                                                                     | Frontend React + React Three Fiber                                                                                                              |
| **Workers (Hono)**                                                                            | Auth, REST API, endpoint WebSocket klien                                                                                                        |
| **Durable Objects**                                                                           | `MarketHub` per aset: pegang koneksi ke sumber data, failover, agregasi candle, broadcast ke klien. Satu koneksi upstream dibagi ke semua klien |
| **D1**                                                                                        | User, candle historis, sinyal, analisis LLM, log, pengaturan alert                                                                              |
| **KV**                                                                                        | Cache ringan (konfigurasi, snapshot harga terakhir)                                                                                             |
| **Provider AI (Workers AI, Gemini, Groq, OpenRouter, Mistral, Hugging Face, Cohere, NVIDIA)** | Voting 4 model di meeting                                                                                                                       |
| **Cron / Queues**                                                                             | Backfill candle, pembersihan log, antrean kirim Discord                                                                                         |

**Rahasia** (API key OANDA, Twelve Data, webhook Discord, kunci LLM) disimpan terenkripsi di D1 dan bisa diedit lewat UI (rincian di bawah). Tidak pernah dikirim ke klien. Yang tetap berupa Worker secret hanya kunci enkripsi utama.

**Manajemen API key (bisa diedit di UI):**

- **Cakupan:** key provider AI (Gemini, Groq, OpenRouter, Mistral, Hugging Face, Cohere, NVIDIA), key sumber data (OANDA, Twelve Data, dan exchange bila ada endpoint yang butuh key), serta webhook Discord. Workers AI memakai binding Cloudflare, jadi tidak butuh key.
- **Lokasi:** tab "API" di panel pengaturan ruang bos.
- **Penyimpanan:** key dienkripsi (mis. AES-GCM) sebelum masuk D1. Hanya Worker yang bisa mendekripsi.
- **Write-only:** UI hanya menampilkan 4 karakter terakhir. Nilai penuh tidak pernah dikirim balik ke klien. Mengedit berarti mengganti dengan nilai baru.
- **Kontrol per provider:** tombol "Tes koneksi", status (valid / gagal / kuota habis), aktif/nonaktif, dan urutan prioritas (sumber data utama dan fallback, provider AI cadangan).
- **Audit:** tercatat siapa dan kapan mengganti, tanpa menyimpan nilai key di log.
- **Keamanan:** hanya pengguna login yang bisa mengubah, ada rate limit, dan key tidak pernah muncul di pesan error atau log.
- **Data & API:** tabel `api_credentials` (provider, kind, ciphertext, last4, enabled, priority, updated\_by, updated\_at), endpoint `GET /settings/api` (tanpa nilai key), `PUT /settings/api/:provider`, `POST /settings/api/:provider/test`.

### 6.1 Stack Teknis (rekomendasi)

| Area              | Pilihan                                    | Alasan                                                                                                            |
| ----------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Build dan routing | Vite + React + React Router (SPA)          | App berat di sisi klien (3D, WebSocket), halaman utama di balik login, tidak butuh SSR. Build cepat dan sederhana |
| 3D                | React Three Fiber + drei                   | Sesuai keputusan. drei menyediakan loader GLB, kontrol kamera, dan helper performa                                |
| State             | Zustand                                    | Ringan dan cocok dengan R3F untuk state yang sering berubah (harga, event meeting)                                |
| Chart             | Lightweight Charts                         | Ringan di HP                                                                                                      |
| Styling           | Tailwind CSS (tema gelap saja)             | Cepat dibuat, token warna konsisten, ukuran CSS akhir kecil                                                       |
| i18n              | react-i18next (Indonesia default, Inggris) | Dua bahasa, termasuk template bubble teks                                                                         |
| Backend           | Hono di Workers + Durable Objects          | Sesuai bagian 6                                                                                                   |
| Validasi          | Zod di package bersama                     | Memvalidasi JSON suara AI dan payload API, dipakai frontend dan backend                                           |
| Database          | D1 + migrasi Wrangler                      | Sesuai bagian 6                                                                                                   |
| Tooling           | TypeScript, pnpm workspaces, Vitest        | Vitest untuk uji indikator dan logika scanner                                                                     |

**Struktur monorepo:**

```
repo/
  apps/web        Vite + React + R3F
  apps/api        Worker Hono, Durable Objects, Cron, Queue consumer
  packages/shared tipe, skema Zod, kunci i18n, konstanta
```

**Deploy:** bagian 6 memakai Pages untuk frontend dan Workers untuk backend. Alternatif yang perlu dicek saat setup: satu Worker yang melayani API dan aset statis frontend sekaligus (satu deploy, satu domain). Deploy lewat Wrangler, manual atau dari CI.

**Next.js tidak dipilih:** SSR dan server components tidak dibutuhkan di app ini, dan menambah lapisan adaptasi di Cloudflare.

## 7. Scanner 4 Kelompok

Scanner membaca pasar lewat **4 kelompok analisis**. Tiap kelompok memberi satu suara arah (long / short / netral) beserta skor 0–100. Dua kelompok yang searah sudah cukup untuk membuka **meeting AI** (bagian 8).

**Dua jenis meeting:**

- **Meeting scanner (tiap 5 menit):** scanner berjalan terjadwal tiap 5 menit, sejajar dengan jam candle 5m (menit ke-0, 5, 10, dan seterusnya), lewat alarm Durable Object atau Cron Trigger. Hanya scanner, tanpa AI. Hasilnya tetap dicatat di log walau tidak ada sinyal.
- **Meeting AI:** dibuka hanya bila syarat scanner terpenuhi pada putaran itu (minimal 2 kelompok searah). Rinciannya di bagian 8.

| Kelompok       | Isi (contoh)                                                                                            | Catatan data                                                                                                                                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. SMC/ICT     | Market structure (BOS/CHoCH), order block, fair value gap (FVG), liquidity sweep, zona premium/discount | Dihitung dari candle OHLC semua timeframe                                                                                                                                                                       |
| 2. Indikator   | EMA, RSI, MACD, ATR, Bollinger Bands                                                                    | Dihitung dari candle OHLC                                                                                                                                                                                       |
| 3. Volume      | Lonjakan volume, VWAP/volume profile, tekanan beli-jual bila tersedia                                   | BTC: volume nyata dari exchange. XAUUSD: tick volume dari spot, ditambah volume perpetual XAUUSDT dari exchange crypto sebagai proxy                                                                            |
| 4. Derivatives | Funding rate, open interest, long/short ratio, likuidasi                                                | BTC: tersedia dari OKX/Binance/Bybit. XAUUSD: tidak ada perpetual standar di OANDA, jadi memakai proxy perpetual XAUUSDT (funding, open interest) dari Binance/Bybit/OKX, ditambah COT mingguan sebagai konteks |

**Output per kelompok:** `{symbol, tf, kelompok, arah, skor, bukti[]}`.

**Aturan pemicu meeting:**

- Minimal **2 dari 4 kelompok** memberi arah yang sama (long atau short) pada aset dan timeframe yang sama, masing-masing dengan skor ≥ ambang (mis. 60).
- Kelompok yang datanya sedang tidak tersedia (mis. data perpetual emas gagal diambil) dianggap **abstain**, bukan netral, dan tidak dihitung.
- Kelompok yang berlawanan arah tidak membatalkan meeting. Suaranya dikirim ke meeting sebagai konteks.
- Dedup: tidak membuka meeting baru untuk aset, arah, dan timeframe yang sama dalam jendela waktu tertentu (mis. satu candle timeframe tersebut).
- Pada tiap putaran 5 menit, semua kelompok dievaluasi memakai candle terakhir yang sudah close di tiap timeframe aktif. Kelompok derivatives memakai nilai terbaru dari polling datanya.

**Pengaturan scanner (bisa diedit di UI):**

- **Lokasi:** panel pengaturan di ruang bos (bagian 10.1). Di mode non-3D tersedia sebagai halaman biasa.
- **Yang bisa diubah:** aktif/nonaktif tiap kelompok per aset, parameter indikator (periode EMA, RSI, MACD, dan lain-lain), parameter SMC/ICT (mis. sensitivitas swing, ukuran minimum FVG), ambang skor tiap kelompok, jumlah minimum kelompok searah untuk membuka meeting (default 2), timeframe aktif per aset, interval scanner (default 5 menit), jendela dedup, dan ambang pergerakan harga yang dianggap signifikan untuk reaksi karyawan (nilai awal berbasis ATR, usulan).
- **Penerapan:** pengaturan disimpan di D1 per aset dan dimuat Worker/Durable Object tanpa deploy ulang. Perubahan berlaku mulai candle close berikutnya.
- **Riwayat:** tiap perubahan tercatat (siapa, kapan, nilai lama dan baru). Tiap sinyal menyimpan versi pengaturan yang dipakai, jadi sinyal lama tetap bisa ditelusuri.
- **Validasi:** batas nilai minimum/maksimum dicek di server, ada tombol "Reset ke default", dan hanya pengguna yang login yang bisa mengubah.
- **Data & API:** tabel `scanner_settings` (symbol, group, params\_json, version, updated\_by, updated\_at), endpoint `GET/PUT /settings/scanner`.

## 8. Meeting AI (Voting 4 Model)

Saat syarat 2 kelompok searah terpenuhi, sistem membuka **meeting**: 4 model AI menerima bahan yang sama, lalu masing-masing memberi suara. Sinyal terbit dari hasil voting, bukan dari satu model.

**Pemicu:** hanya saat syarat scanner terpenuhi pada putaran meeting scanner 5 menit. Tidak ada panggilan AI di luar itu, sehingga biaya dan latensi terkendali.

**Provider yang didukung** (aktif per provider lewat konfigurasi, tiap API key disimpan sebagai Worker secret):

| Provider              | Catatan                            |
| --------------------- | ---------------------------------- |
| Cloudflare Workers AI | Native di Cloudflare lewat binding |
| Gemini                | API key sendiri                    |
| Groq                  | API key sendiri                    |
| OpenRouter            | Satu key untuk banyak model        |
| Mistral               | API key sendiri                    |
| Hugging Face          | API key sendiri                    |
| Cohere                | API key sendiri                    |
| NVIDIA                | API key sendiri                    |

**Peserta:** 4 slot, tiap slot berisi satu provider + satu model, dapat diatur di konfigurasi. Default awal: Workers AI, Gemini, Groq, dan OpenRouter. Disarankan lintas provider agar suaranya beragam. Bila satu provider gagal atau timeout, slot pindah ke provider cadangan.

**Divisi RR dan bos (tidak memberi suara):**

- **Divisi RR:** menghitung rasio risk-reward dari level hasil voting, yaitu jarak entri ke target dibagi jarak entri ke invalidasi. Angkanya ditampilkan di meeting dan pada sinyal.
- **Bos:** memberi **persetujuan akhir** sinyal setelah voting dan hitungan RR selesai. Sinyal baru terbit bila bos menyetujui.
- **Aturan persetujuan bos:** otomatis berbasis aturan, yaitu setuju bila mayoritas voting tercapai (≥ 3 dari 4) dan RR ≥ ambang minimum (default 1:1, bisa diubah di UI). Bila tidak, sinyal ditolak dan tetap dicatat di log beserta alasannya.

**Bahan meeting:** ringkasan 4 kelompok scanner (arah, skor, bukti, termasuk yang berlawanan), snapshot candle, konteks multi-timeframe, dan sumber data aktif.

**Suara tiap AI (JSON terstruktur):**

```json
{
  "vote": "long|short|netral",
  "keyakinan": 0-100,
  "alasan": "2-3 kalimat",
  "level": {"entri": 0, "invalidasi": 0, "target": [0]},
  "risiko": ["..."]
}
```

**Aturan keputusan (mayoritas sederhana):**

- Empat AI dipanggil paralel dengan timeout per AI. Suara yang gagal parse dicoba ulang sekali, lalu dianggap abstain.
- Sinyal diajukan ke bos untuk persetujuan akhir bila **≥ 3 dari 4** suara memilih arah yang sama (mayoritas sederhana). Arah mayoritas yang berbeda dari arah scanner ditandai "berlawanan scanner" pada sinyal.
- Hasil 2–2 atau tanpa mayoritas: tidak ada sinyal (status `ditolak`), tetap dicatat.
- Kurang dari 3 suara valid: meeting ditandai `tidak_kuorum`, tidak ada sinyal.
- Level akhir = median level dari suara mayoritas. Keyakinan = rata-rata keyakinan suara mayoritas.

Setiap meeting dicatat penuh di D1: peserta, model, suara, alasan, latensi, dan hasil. Setiap sinyal menampilkan disclaimer bahwa ini bukan nasihat keuangan.

## 9. Trading System (Sinyal dan Log)

Tanpa order. Fungsinya mencatat dan menyajikan sinyal.

**Siklus status sinyal:** `kandidat` → `dianalisis` → `aktif` → `kedaluwarsa` (atau `dibatalkan`).

Pada alur ini, setelah `dianalisis` (voting dan hitungan RR) sinyal menunggu persetujuan bos: bila disetujui menjadi `aktif`, bila tidak menjadi `ditolak`. Keduanya dicatat beserta alasannya.

**Data per sinyal:** aset, timeframe, arah, skor, level, hasil meeting AI, sumber data aktif, waktu dibuat, status.

**Log:** setiap kandidat, hasil meeting AI, pengiriman alert, dan peristiwa failover tercatat di D1 dengan retensi yang diatur di UI lewat panel pengaturan ruang bos (default selamanya, dihapus manual).

## 10. Kantor 3D

### 10.1 Scene

- Kantor semi-realistis dengan 2 lantai dan beberapa ruangan: meja kerja, monitor, area rapat, dinding dengan **layar trading besar** (satu untuk BTCUSDT, satu untuk XAUUSD).
- 10+ karyawan dengan peran:
  - **Analis (4, satu per slot AI):** tiap analis terkait aset dan/atau timeframe tertentu, menampilkan indikator bubble status (long/short/netral) dan membuka panel analisis saat diklik.
  - **Crowd reaktif (sisanya):** karyawan umum, IT, penerima tamu, divisi RR, dan bos yang bereaksi ke pergerakan harga dan kejadian di kantor (rincian di bagian 10.7).

**Ruang tambahan** (fungsi di bawah usulan, perlu dikonfirmasi):

- **Ruang bos:** ruangan terpisah berkaca di sisi kantor. Klik pintunya untuk membuka ringkasan: sinyal aktif, riwayat meeting AI, dan pengaturan (susunan 4 AI, pengaturan scanner, alert).
- **Ruang kopi:** pantry dengan mesin kopi dan meja kecil. Karyawan yang sedang idle (pasar tenang) berkunjung ke sini, jadi kantor terlihat hidup.
- **Musolla:** ruang kecil yang tenang. Karyawan idle bisa singgah sebentar; tidak ada data atau fungsi trading di ruangan ini.

Kamera bisa fokus ke tiap ruang lewat tombol cepat. Untuk performa HP, ruang yang tidak terlihat kamera tidak dirender, dan profil Low menyederhanakan isi ruang tambahan (objek lebih sedikit, tanpa karyawan idle di dalamnya).

**Tata letak 2 lantai (dikonfirmasi):**

- **Lantai 1:** area kerja analis dengan layar trading BTCUSDT dan XAUUSD, pojok IT, ruang kopi, musolla, dan lobby.
- **Lantai 2:** ruang rapat, ruang bos, dan area divisi RR.
- **Antar lantai:** tangga (lift sebagai elemen visual). Karyawan berpindah lantai dengan animasi berjalan, terutama saat menuju ruang rapat.
- **Kamera:** tombol pilih lantai (1 / 2 / semua) dan mode potongan yang menyembunyikan lantai atas agar lantai bawah terlihat.
- **Performa:** hanya lantai yang terlihat kamera yang dirender penuh. Lantai lain memakai LOD sederhana atau disembunyikan, dan profil Low membatasi jumlah karyawan yang berpindah lantai.

### 10.2 Reaksi terhadap harga

| Kondisi                           | Reaksi karyawan                                                                                                                          |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Naik signifikan                   | Bersorak, tos, gerak ceria                                                                                                               |
| Turun signifikan                  | Panik, memegang kepala, bergegas                                                                                                         |
| Volatilitas tinggi (ATR ekspansi) | Berdiri, mondar-mandir, bicara ramai                                                                                                     |
| Sinyal baru                       | Meeting: 4 analis AI berkumpul di meja rapat, tiap suara muncul sebagai bubble. Sinyal terbit: analis terkait berdiri dan menunjuk layar |
| Pasar tenang                      | Idle: mengetik, sebagian ke ruang kopi atau musolla                                                                                      |

Reaksi digerakkan oleh **state pasar** (arah, magnitudo perubahan, volatilitas) yang dihitung di server dan dikirim ke klien, bukan dihitung ulang di tiap perangkat.

### 10.3 Interaksi

1. **Klik karyawan analis → panel analisis** (sinyal terakhir, hasil meeting (suara tiap AI), level, riwayat singkat).
2. **Klik layar trading → chart fullscreen** (membuka halaman chart sendiri, lihat bagian 10.5).
3. **Kamera orbit bebas** (sentuh untuk putar, cubit untuk zoom, batas jarak/sudut agar tidak keluar ruangan). Tersedia tombol reset kamera.
4. **Notifikasi/alert** tampil juga di dalam app (toast + indikator di kantor), selain Discord.

Halaman chart dianjurkan memakai library chart 2D ringan (mis. Lightweight Charts) di atas overlay HTML, bukan digambar di dalam canvas 3D, agar tajam dan hemat performa.

### 10.4 Ritme Meeting dan Suasana Natural

Kantor harus terasa hidup, bukan animasi berulang yang kaku.

**Ritme meeting:**

- **Tiap 5 menit, meeting scanner:** analis berjalan ke ruang rapat, scanner berjalan, hasil tiap kelompok tampil di layar ruang rapat, dan tiap analis menyampaikannya lewat speech bubble. Meeting singkat. Bila syarat tidak terpenuhi, semua bubar dan kembali ke aktivitas masing-masing.
- **Bila syarat scanner terpenuhi, meeting AI:** 4 analis AI duduk di meja rapat dan suaranya muncul satu per satu sebagai speech bubble. Divisi RR dan bos ikut hadir di ruang rapat: RR memaparkan hitungan risk-reward dan bos memberi persetujuan akhir (setuju atau tolak), lalu keputusan akhir tampil di layar ruang rapat. Bila sinyal terbit, notifikasi muncul di app dan alert terkirim ke Discord.
- Jadwal meeting mengikuti jam server, jadi yang terlihat di kantor selalu sama dengan yang benar-benar terjadi di backend. Tidak ada meeting palsu.

**Suasana natural (usulan):**

- Karyawan punya rutinitas bervariasi: bekerja di meja, mengobrol, ke ruang kopi, singgah di musolla, ke ruang bos, berdiskusi di depan layar.
- Gerakan tidak serentak: waktu mulai, jalur, dan durasi aktivitas diacak dalam batas wajar. Perpindahan memakai jalur jalan sederhana (waypoint atau navmesh) dengan animasi yang menyatu halus.
- Reaksi terhadap harga proporsional dengan besar pergerakan dan hanya melibatkan sebagian karyawan, tidak semuanya sekaligus.
- Pencahayaan jendela mengikuti jam lokal (pagi, siang, malam). Suara ambient bersifat opsional dan mati secara default.
- Perilaku dihitung di klien dari event ringan yang dikirim server (mulai meeting, hasil scanner, state pasar), jadi hemat bandwidth dan beban server.
- Di profil Low, jumlah karyawan yang berjalan dibatasi dan perilaku disederhanakan.

### 10.5 Halaman Chart

Chart punya halaman sendiri, terpisah dari kantor 3D. Rutenya `/chart/:symbol` (mis. `/chart/btcusdt` dan `/chart/xauusd`). Bisa dibuka dari klik layar trading di kantor, lewat menu, atau lewat tautan langsung. Halaman ini tanpa render 3D, jadi ringan di HP.

- **Chart:** candlestick realtime dengan tab timeframe 5m, 15m, H1, H4, dan D1, crosshair, zoom dan geser dengan sentuhan, serta pindah cepat antara BTCUSDT dan XAUUSD. Mendukung portrait dan landscape.
- **Indikator:** overlay dan panel bawah dari kelompok indikator (EMA, Bollinger Bands, RSI, MACD, ATR), bisa dinyalakan atau dimatikan. Periode mengikuti pengaturan scanner.
- **SMC/ICT dan sinyal:** zona dari scanner (order block, FVG, level BOS/CHoCH, liquidity) digambar di chart dan bisa disembunyikan. Sinyal yang terbit ditandai di candle, dengan garis level entri, invalidasi, dan target. Ketuk penanda untuk melihat hasil meeting AI.
- **Volume dan derivatives:** panel volume, serta panel funding rate dan open interest (BTC dari exchange, emas dari proxy perpetual XAUUSDT).
- **Status data:** badge sumber aktif (live / fallback / stale), harga terakhir, dan perubahan 24 jam.
- **Alert dari chart:** buat alert harga dengan menarik garis level. Alert dikirim ke channel Discord yang sama.
- **Data:** candle historis lewat `GET /market/:symbol/candles`, pembaruan realtime lewat `WS /stream`.
- **Navigasi:** tombol kembali ke kantor 3D, memakai sesi login yang sama.
- **Teknis:** library chart 2D ringan (mis. Lightweight Charts), dengan lapisan overlay kustom untuk zona SMC/ICT.

### 10.6 Tampilan Publik Kantor 3D

Halaman publik menampilkan kantor 3D tanpa login, hanya untuk dilihat (read-only).

- **Yang tampil:** kantor 2 lantai dengan karyawan yang beraktivitas, meeting scanner tiap 5 menit, dan meeting AI saat berlangsung. Kamera orbit dan pilihan lantai tersedia.
- **Yang disembunyikan (usulan):** level entri/invalidasi/target, isi analisis dan suara tiap AI, pengaturan, API, dan halaman chart. Rekomendasi: pengunjung melihat suasana kantor, mood pasar (naik / turun / tenang), dan status meeting (scanner, AI, disetujui atau ditolak). Arah sinyal (long/short), angka harga, dan level tidak ditampilkan. Alasannya: menghindari masalah lisensi data, tidak terlihat seperti rekomendasi trading ke publik, dan menjaga strategi tetap privat.
- **Harga:** tidak ditampilkan di versi publik sampai syarat lisensi data OANDA dan Twelve Data dicek. Reaksi karyawan terhadap harga tetap tampil sebagai animasi. Mood pasar dihitung di server dan hanya dikirim sebagai kategori (naik, turun, tenang), bukan angka.
- **Pengiriman data:** stream publik terpisah (`WS /public/stream`) yang hanya berisi event yang sudah disaring (mulai meeting, ada atau tidaknya sinyal, mood pasar). Tidak melewati sesi login.
- **Beban:** event publik di-broadcast dari Durable Object tanpa kerja tambahan per pengunjung (WebSocket hibernation), dengan batas jumlah koneksi publik dan rate limit per IP.
- **Performa:** memakai profil kualitas adaptif yang sama. Tombol "Masuk" mengarah ke tampilan penuh.

### 10.7 Katalog Aktivitas dan Peran Karyawan

Usulan awal, bisa dikoreksi. Jumlah karyawan awal 12 dan bisa diatur di konfigurasi.

| Peran         | Jumlah | Lokasi utama         | Kekhasan                                                                                                                  |
| ------------- | ------ | -------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Analis AI     | 4      | Lantai 1, area kerja | Satu per slot AI di meeting. Membaca layar trading dan berdiskusi antar analis                                            |
| Divisi RR     | 2      | Lantai 2, area RR    | Menghitung risk-reward dan memaparkannya di meeting AI                                                                    |
| Bos           | 1      | Lantai 2, ruang bos  | Telepon, membaca laporan, keliling kantor. Memberi persetujuan akhir di meeting AI                                        |
| IT            | 2      | Lantai 1, pojok IT   | Memantau status server dan data. Bereaksi saat sumber data failover atau provider AI gagal (bergegas ke layar, menelepon) |
| Penerima tamu | 1      | Lobby, lantai 1      | Menyapa, menerima telepon, mengetik. Di tampilan publik memberi bubble sapaan singkat                                     |
| Karyawan umum | 2      | Tersebar             | Rutinitas umum dan bereaksi terhadap harga                                                                                |

| Aktivitas              | Gerakan                                                         | Tempat                          | Durasi       |
| ---------------------- | --------------------------------------------------------------- | ------------------------------- | ------------ |
| Kerja di meja          | Duduk, mengetik, membaca layar, sesekali menoleh                | Meja kerja                      | 2–6 menit    |
| Ngobrol dan diskusi    | Berdiri berdua atau bertiga dengan gestur bicara                | Lorong, dekat layar, ruang kopi | 30–90 detik  |
| Ngopi dan istirahat    | Membuat kopi, duduk santai, singgah di musolla                  | Ruang kopi, musolla             | 1–3 menit    |
| Telepon dan presentasi | Telepon sambil berdiri atau berjalan, presentasi di depan layar | Meja, depan layar, ruang rapat  | 30–120 detik |

**Aturan pemilihan aktivitas:**

- Tiap karyawan memilih aktivitas berikutnya berdasarkan bobot sesuai perannya (mis. analis lebih sering kerja di meja, penerima tamu lebih sering telepon), dengan jeda agar tidak mengulang aktivitas yang sama berturut-turut.
- Ruang punya kapasitas (mis. ruang kopi maksimal 3 orang) agar karyawan tidak menumpuk.
- Kejadian mengalahkan rutinitas: meeting scanner, meeting AI, lonjakan harga, dan failover data.
- Perilaku dihitung di klien, jadi tidak membebani server.

**Bubble teks saat tidak meeting (campuran):**

- **Obrolan santai acak:** topik sehari-hari (kopi, jam makan, cuaca) dari daftar template.
- **Komentar pasar singkat:** dibuat dari state pasar, mis. "pasar lagi tenang". Di tampilan publik hanya berupa mood, tanpa angka dan tanpa arah sinyal.
- **Bahasa:** mengikuti bahasa app (Indonesia default).
- **Teknis:** template disimpan sebagai teks i18n, tanpa memanggil LLM. Frekuensi dibatasi dan hanya untuk karyawan yang dekat kamera, agar layar tidak penuh dan performa terjaga.

## 11. Performa dan Kualitas Adaptif (HP)

Semi-realistis + 10+ karakter + HP adalah risiko performa terbesar. Strategi:

- **Profil kualitas otomatis:** Low / Medium / High, dipilih dari deteksi perangkat dan FPS awal, bisa diubah manual.
- **Crowd hemat di HP:** jumlah karakter aktif bergantung profil (mis. Low: analis + sedikit crowd, High: semua). Karakter jauh memakai LOD atau animasi disederhanakan.
- **Aset:** GLB terkompresi (Draco/Meshopt), tekstur KTX2, atlas tekstur, jumlah material minimal, _baked lighting/lightmap_ untuk ruangan statis, bayangan dinamis hanya di High.
- **Rendering:** batasi devicePixelRatio (mis. maks 1.5–2), _render on demand_ saat adegan statis, jeda render saat tab tidak aktif.
- **Instancing** untuk objek berulang (kursi, meja, dekorasi).
- **Target:** ≥ 30 FPS di HP kelas menengah profil Medium; waktu muat awal (aset inti) < 5 detik di jaringan 4G.
- **Fallback non-3D:** bila WebGL gagal atau FPS sangat rendah, tampilkan mode daftar/chart 2D agar pengguna tetap bisa memantau.

## 12. Alert Discord

- Satu channel Discord untuk semua aset dan jenis alert (satu webhook, URL-nya diedit di UI pada tab API). Dikirim lewat webhook Discord dari Worker (via Queue agar tahan gagal dan terkendali rate-nya).
- **Jenis alert:** (a) sinyal disetujui bos dan (b) harga menyentuh level yang ditentukan pengguna, keduanya aktif di awal; (c) volatilitas ekstrem, (d) sinyal ditolak, dan (e) failover sumber data tersedia tetapi nonaktif di awal, bisa dinyalakan di UI.
- **Isi pesan:** aset, arah, level, ringkasan singkat hasil meeting AI, sumber data, waktu, disclaimer singkat.
- **Kontrol:** pengaturan per jenis alert (aktif/nonaktif), jeda minimum antar alert (cooldown), dan dedup.
- Alert juga muncul di dalam app.

## 13. Model Data (D1, ringkas)

| Tabel           | Kolom utama                                                              |
| --------------- | ------------------------------------------------------------------------ |
| `users`         | id, password\_hash, created\_at                                          |
| `candles`       | symbol, tf, t, o, h, l, c, v, source                                     |
| `signals`       | id, symbol, tf, direction, score, status, levels\_json, created\_at      |
| `analyses`      | id, signal\_id, bias, confidence, summary, raw\_json, model, created\_at |
| `alerts`        | id, user\_id, type, symbol, rule\_json, enabled, cooldown\_s             |
| `alert_log`     | id, alert\_id/signal\_id, channel, status, sent\_at                      |
| `source_events` | id, symbol, from\_source, to\_source, reason, at                         |

## 14. API dan Realtime (ringkas)

- `POST /auth/login`, `POST /auth/logout`
- `GET /market/:symbol/candles?tf=&limit=` → candle historis
- `GET /signals?symbol=&status=` → daftar sinyal
- `GET /signals/:id` → detail + analisis LLM
- `GET/PUT /alerts` → pengaturan alert
- `WS /stream` → tick, candle baru, state pasar (untuk animasi), sinyal baru, status sumber data

## 15. Kebutuhan Non-Fungsional

- **Latensi:** tick dari sumber ke layar di bawah \~1–2 detik pada kondisi normal.
- **Keandalan:** failover otomatis, indikator status data yang jujur (live/fallback/stale).
- **Keamanan:** API key terenkripsi di D1 (kunci enkripsi utama di Worker secret), password di-hash, rate limit login, CORS ketat, validasi semua input.
- **Privasi:** hanya data akun minimal; tidak menyimpan kredensial exchange/broker pengguna.
- **Kepatuhan:** disclaimer jelas bahwa sinyal bukan nasihat keuangan. Cek ketentuan lisensi/penggunaan data dari OANDA dan Twelve Data (terutama bila aplikasi nanti dibuka untuk publik).
- **Aksesibilitas:** mode non-3D, tema gelap saja (kontras teks panel dijaga), ukuran tap yang memadai.

**Bahasa:** antarmuka dan analisis AI tersedia dalam Indonesia dan Inggris, dengan pilihan bahasa di pengaturan (default Indonesia). Teks antarmuka disimpan sebagai file terjemahan (i18n). Prompt meeting AI meminta alasan dalam bahasa yang dipilih. Pesan alert Discord mengikuti bahasa app.

## 16. Fase Pengembangan

| Fase                   | Isi                                                                                                                                                               | Hasil                                                      |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| **0 — Pondasi**        | Repo, Pages + Workers, auth, D1 skema                                                                                                                             | Login berfungsi                                            |
| **1 — Data**           | MarketHub DO untuk BTC (OKX) lalu XAU (OANDA), failover, candle 5 timeframe                                                                                       | Harga/candle realtime + badge sumber + halaman chart dasar |
| **2 — Scanner**        | 4 kelompok scanner, kandidat sinyal, log                                                                                                                          | Sinyal rule-based tersimpan                                |
| **3 — Meeting AI**     | Meeting 4 AI: multi-provider, voting, validasi, dedup                                                                                                             | Sinyal + hasil voting                                      |
| **4 — Kantor 3D**      | Scene, layar, karyawan analis, orbit, klik-interaksi                                                                                                              | Prototipe 3D di HP                                         |
| **5 — Crowd & Reaksi** | Crowd 10+, perilaku natural, ritme meeting 5 menit, animasi reaksi harga, kantor 2 lantai dengan ruang bos/kopi/musolla, tampilan publik, profil kualitas adaptif | Pengalaman penuh                                           |
| **6 — Alert**          | Discord webhook, pengaturan alert, cooldown                                                                                                                       | Alert aktif                                                |
| **7 — Hardening**      | Uji performa HP, uji failover, monitoring, perapian                                                                                                               | Siap rilis                                                 |

## 17. Metrik Keberhasilan

- ≥ 30 FPS di HP kelas menengah (profil Medium)
- Waktu muat awal < 5 detik (4G)
- Uptime data ≥ 99% (termasuk failover)
- Failover pulih < 30 detik
- Alert Discord terkirim < 5 detik setelah sinyal final
- Tingkat gagal parse suara AI < 2%

## 18. Risiko

| Risiko                                   | Dampak                       | Mitigasi                                                                         |
| ---------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------- |
| Performa 3D semi-realistis di HP         | UX patah-patah               | Kualitas adaptif, LOD, baked lighting, fallback 2D                               |
| Kuota/limit API OANDA & Twelve Data      | Data emas terputus           | Cek plan lebih awal, cache, polling cerdas, fallback                             |
| Beda harga antar sumber saat failover    | Candle terlihat gap          | Tandai peristiwa failover, normalisasi                                           |
| Biaya/latensi 4 panggilan AI per meeting | Lambat/mahal                 | Meeting hanya saat ≥ 2 kelompok searah, dedup, timeout per AI, provider cadangan |
| Sinyal salah / pengguna terlalu percaya  | Kerugian pengguna            | Disclaimer, label keyakinan, status "dipertanyakan"                              |
| Lisensi data pihak ketiga                | Hambatan jika dipublikasikan | Verifikasi syarat penggunaan sebelum rilis publik                                |

## 19. Pertanyaan Terbuka

1. **Login sederhana:** diputuskan: login dengan satu password saja (tanpa username), tanpa magic link atau 2FA. Diputuskan: satu pengguna (pemilik), tanpa multi-user.
2. **Peserta meeting:** susunan 4 slot diatur bebas di konfigurasi. Default awal: Workers AI, Gemini, Groq, dan OpenRouter.
3. **Parameter scanner:** ambang skor, jendela dedup, dan aturan final tiap kelompok (SMC/ICT, indikator, volume, derivatives) cukup ditentukan sebagai nilai awal (default) karena bisa diubah di UI.
4. **Evaluasi hasil sinyal:** diputuskan cukup log sinyal, tanpa pelacakan hasil (kena target/invalidasi). Bisa dipertimbangkan di fase berikutnya.
5. **Aset 3D:** diputuskan: model dihasilkan dengan AI lalu dirapikan (retopologi, UV, rigging, kompresi GLB). Perlu dipastikan hak pakai hasil generator yang dipilih dan kelayakan hasilnya untuk animasi karyawan.
6. **Domain/subdomain:** diputuskan: subdomain dari muidsoft.com, namanya ditentukan kemudian oleh pemilik.
7. **Retensi data:** retensi log sinyal dan meeting AI diputuskan diatur di UI. Default awal log: selamanya (dihapus manual). Candle: disimpan semua (1 tahun awal, lalu terus bertambah).

**Tambahan setelah revisi scanner 4 kelompok dan meeting AI:**

- **Derivatives untuk XAUUSD:** diputuskan memakai perpetual XAUUSDT di Binance/Bybit/OKX (utama) dan COT mingguan (konteks). Perlu dicek: kontrak yang tersedia di tiap exchange, field API (funding, open interest), dan syarat penggunaan.
- **Volume untuk XAUUSD:** diputuskan tick volume spot + volume perpetual XAUUSDT sebagai proxy. Bobot keduanya di kelompok volume perlu ditentukan.
- **Aturan voting:** diputuskan mayoritas sederhana (3 dari 4). Sinyal yang berlawanan dengan scanner tetap terbit dengan penanda.
- **Pemicu meeting:** cukup 2 kelompok searah dengan skor ≥ ambang yang sama, atau ambang berbeda per kelompok?
- **Definisi SMC/ICT:** definisi swing, BOS, order block, dan FVG yang dipakai perlu dikunci agar hasil scanner konsisten.

**Tambahan setelah keputusan data awal, tema, dan bahasa:**

- **Pembaruan 5 menit:** diputuskan: harga di layar trading, chart, dan reaksi karyawan tetap realtime lewat WebSocket. Penyimpanan candle ke D1 dan scanner berjalan per 5 menit.
- **Bahasa:** diputuskan: bahasa default Indonesia, dan alert Discord mengikuti bahasa app.

**Tambahan setelah kantor 2 lantai, tampilan publik, dan divisi RR:**

- **Divisi RR:** diputuskan: Risk & Reward, bertugas menghitung RR. Ambang RR minimum awal 1:1, dipakai bos untuk menyetujui sinyal, dan bisa diubah di UI.
- **Peran bos di meeting:** diputuskan: memberi persetujuan akhir sinyal. Persetujuan otomatis berbasis aturan, tanpa mode manual.
- **Tampilan publik:** rekomendasi dipakai: suasana kantor, mood pasar, dan status meeting, tanpa harga, arah sinyal, dan level. Lisensi data OANDA dan Twelve Data untuk tampilan publik perlu dicek.
- **Tata letak 2 lantai:** dikonfirmasi: lantai 2 berisi ruang bos, divisi RR, dan ruang rapat; lantai 1 berisi sisanya.

---

## 20. Keputusan Terkonfirmasi — Sesi Finalisasi PRD (11 Oktober 2026)

Bagian ini memuat keputusan eksplisit pengguna melalui tanya jawab setelah draf v1 diunggah. **Apabila ada perbedaan, keputusan bagian 20 memiliki prioritas lebih tinggi** daripada deskripsi, tabel, aturan voting, maupun fase pengembangan di bagian sebelumnya. Tidak ada implementasi atau perubahan repo yang diminta pada sesi ini.

### 20.1 Pembagian analis — Keputusan 1 (Opsi C)

- **4 analis scanner**, masing-masing untuk SMC/ICT, indikator, volume, dan derivatives.
- **4 analis AI**, mewakili 4 slot provider/model voting yang dapat dikonfigurasi.
- **2 staf divisi Risk & Reward (RR)**.
- **1 bos**, pemberi persetujuan akhir otomatis berdasarkan aturan.
- Total **11 karakter inti**; IT, resepsionis, dan karyawan umum merupakan karakter tambahan, sehingga angka awal **12 karyawan pada bagian 10.7 perlu direvisi** saat penetapan jumlah final.
- Analis scanner dan analis AI adalah **peran terpisah**, bukan empat karakter yang merangkap.

### 20.2 Ritme meeting — Keputusan 2 (Opsi A)

- **Setiap 5 menit**, empat analis scanner **berjalan ke ruang rapat** untuk meeting scanner dan menyampaikan hasil masing-masing kelompok.
- Bila syarat konsensus scanner terpenuhi, **empat analis AI menyusul** dan meeting AI dilaksanakan.
- Divisi RR dan bos menghadiri tahap evaluasi level/RR dan keputusan akhir bila meeting AI terpicu.
- Bila pemicu AI tidak terpenuhi, meeting scanner berakhir dan analis kembali bekerja.
- Animasi mengikuti peristiwa backend yang benar-benar terjadi; animasi tidak menentukan sinyal atau menjalankan panggilan AI sendiri.

### 20.3 Lokasi meeting — Keputusan 3 (Opsi A)

- **Seluruh meeting scanner dan meeting AI berada di satu ruang rapat utama lantai 2**, dekat ruang bos dan divisi RR.
- Peserta berpindah antarlantai dengan animasi berjalan melalui tangga.
- Pada profil kualitas Low, ruang meeting **tetap di lantai 2**; detail dan animasi disederhanakan, bukan memindahkan rapat ke lantai 1.

### 20.4 Desain ruang meeting — Keputusan 4 (Opsi D)

- Desain **Hybrid Executive + Trading War Room**: kantor semi-realistis premium, meja panjang, bos di ujung meja, tempat duduk untuk empat analis scanner, empat analis AI dan dua staf RR.
- Monitor besar menampilkan konteks BTCUSDT, XAUUSD, hasil scanner, voting, level dan RR.
- Pembicara ditandai oleh **speech bubble** dan fokus kamera sinematik; kontrol kamera manual tetap tersedia.
- Dinding kaca, pencahayaan dan furnitur profesional menjadi arahan estetika.

### 20.5 Presentasi AI — Keputusan 5 (Opsi D)

- Keempat AI **menganalisis dan memberikan voting secara paralel** dengan bahan meeting yang sama.
- Sesudah hasil tersedia, karakter AI **mempresentasikan hasil secara bergiliran** dengan speech bubble dan fokus kamera.
- Perbedaan pendapat dapat divisualisasikan dari **hasil yang sudah ada**, **tanpa panggilan LLM tambahan** untuk adegan debat.
- Divisi RR memeriksa level dan bos mengambil keputusan sesudah presentasi.
- Urutan narasi/animasi tidak mengubah voting atau hasil backend.

### 20.6 Struktur level sinyal — Keputusan 6 (Opsi D)

- **Entry adaptif**: satu harga entry atau sebuah zona entry, sesuai struktur pasar, ATR, dan analisis AI.
- **Tepat satu Stop Loss (SL)** per sinyal.
- **Satu hingga tiga Take Profit (TP1–TP3)** sesuai situasi; TP tambahan tidak wajib ada.
- Penentuan dan penggabungan level harus melalui **validasi deterministik di backend**, termasuk arah level, ukuran risiko dan jarak level.
- Untuk zona entry, RR dihitung menggunakan **harga entry yang paling tidak menguntungkan** dalam zona.
- Detail level tersedia di chart, detail sinyal, dan pesan Discord untuk sinyal yang terbit.

### 20.7 Voting AI tanpa mayoritas — Keputusan 7 (Opsi C)

- Bila **minimal 3 dari 4 AI** memilih arah yang sama, arah itu diajukan ke bos dengan validasi RR.
- Bila hasil AI **2–2 LONG versus SHORT**, bos boleh memakai arah pemenang scanner sebagai **tie-breaker**, **hanya** apabila aturan kekuatan scanner di bagian 20.8 terpenuhi.
- Jika tidak ada pemenang scanner yang sah atau level/RR tidak valid, **sinyal ditolak** dan alasannya masuk log.
- Sinyal yang disetujui melalui jalur ini diberi penanda khusus **`scanner_tie_breaker`** agar dapat dibedakan dari mayoritas AI.
- Ini **menggantikan aturan lama bagian 8** yang selalu menolak voting 2–2.
- Perilaku pola tanpa mayoritas selain 2–2 serta kasus suara gagal/abstain **belum dirinci lebih jauh** dan tetap memerlukan penguncian aturan.

### 20.8 Penentu kekuatan scanner untuk tie-breaker — Keputusan 8 (Opsi D)

Scanner hanya boleh menjadi penentu jika **semua** syarat ini terpenuhi:

1. Minimal **dua kelompok scanner** valid mendukung arah yang sama.
2. **Jumlah kelompok pendukung arah itu lebih banyak** daripada kelompok yang mendukung arah lawan.
3. **Total skor** pendukung arah pemenang **unggul atas skor lawan dengan margin minimum** yang dikonfigurasi.
4. Penilaian menggunakan hasil scanner untuk **aset dan timeframe yang sama** pada putaran relevan.
5. **Ambang skor per kelompok dan margin selisih total skor** dapat diubah di admin, divalidasi oleh backend, dan dicatat versinya.

Jika syarat tersebut gagal, bos tidak memaksakan keputusan dan sinyal ditolak. **Margin default 40 poin dikonfirmasi pada 12 Oktober 2026**; override numerik admin tetap dipertahankan, dan null dapat dipilih admin untuk menonaktifkan tie-breaker.

### 20.9 Validasi RR — Keputusan 9 (Opsi A)

- **Minimum RR default 1:1 pada TP1** untuk semua aset/timeframe.
- Target TP2 dan TP3 (jika ada) adalah target tambahan, bukan pengganti ambang pada TP1.
- **Satu SL** menjadi acuan semua target.
- RR pada **zona entry** dihitung memakai batas entry yang menghasilkan RR **terburuk**.
- Divisi RR/worker menghitung secara **deterministik**; bos menolak sinyal jika RR TP1 kurang dari ambang minimum, meskipun suara AI/scanner mendukung.
- Angka RR minimum **dapat diubah di admin**, tetapi default awal adalah 1:1 (bukan adaptif otomatis).

### 20.10 Masa berlaku dan pembatalan — Keputusan 10 (Opsi D)

- Setiap sinyal memiliki batas waktu menunggu entry berdasarkan **timeframe**; durasi yang dikonfirmasi tercantum pada bagian 20.11.
- Setelah bos menyetujui, sinyal berstatus **menunggu entry** sampai harga mencapai harga/zona entry.
- Sistem merekam **waktu dan harga saat entry tersentuh**, lalu memantau **TP1 dan SL**. Sinyal selesai segera pada TP1; TP2/TP3 tetap ditampilkan sebagai informasi tambahan. Pembatalan struktur otomatis dinonaktifkan, dan sinyal berlawanan hanya membatalkan yang masih menunggu entry pada timeframe sama (20.12).
- Sinyal dapat berakhir dengan status **target tercapai, stop loss, dibatalkan, atau kedaluwarsa** sesuai aturan yang akan dikunci.
- Perubahan status dan peristiwa harga disimpan untuk audit dan evaluasi kualitas sinyal; **tidak ada eksekusi order**.
- Ini **mengubah non-tujuan pelacakan hasil di bagian 19 angka 4**: pelacakan status entry/TP/SL kini termasuk cakupan, tetapi bukan trading otomatis.
- Urutan tick yang teramati menentukan sentuhan. Jika candle menyentuh TP1 dan SL tanpa urutan tick, hasil **ambigu**, bukan kemenangan atau kerugian yang ditebak. Kebijakan rinci tercatat pada 20.12.

### 20.11 Durasi menunggu entry — Keputusan 11 (Opsi A, 12 Oktober 2026)

Pemilik mengonfirmasi opsi **A** saat melanjutkan implementasi:

| Timeframe | Batas waktu menunggu entry |
| --------- | -------------------------- |
| 5m        | 15 menit                   |
| 15m       | 45 menit                   |
| H1        | 3 jam                      |
| H4        | 12 jam                     |
| D1        | 3 hari                     |

- Durasi hanya membatasi **waktu menunggu entry**. Setelah entry tersentuh, hitung mundur **berhenti** dan sinyal dipantau sampai target akhir, SL, atau pembatalan yang berlaku.
- Deadline entry asli tetap tersimpan untuk audit; tanggal kedaluwarsa lama tidak ditulis ulang pada sinyal historis.
- Default tetap dapat diubah di admin. Konfigurasi lama yang masih kosong diisi melalui migrasi berversi/audit, tanpa menimpa override numerik.
- Durasi emas **sebelum entry** hanya menghitung waktu pasar buka menurut status provider. Durasi dijeda saat tutup atau status tidak diketahui, dengan peringatan dan sisa budget tersimpan (20.12).
- Margin default 40 dan kebijakan pembatalan sudah dikonfirmasi pada 20.12.

### 20.12 Keputusan lanjutan saat implementasi — 12 Oktober 2026

Semua baris berikut adalah jawaban eksplisit pemilik saat coding dilanjutkan, menggantikan ketentuan lama yang bertentangan.

| Area                 | Keputusan terkonfirmasi                                                                                                                                                                                                                                  |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tie-breaker          | Margin minimum selisih total skor **40**, tetap mensyaratkan jumlah kelompok pendukung lebih banyak dan minimal dua kelompok valid.                                                                                                                      |
| Durasi XAUUSD        | Hitung **waktu pasar buka saja**, berdasarkan status provider. Saat tutup atau status tidak diketahui, jeda dan tampilkan peringatan.                                                                                                                    |
| Sinyal berlawanan    | Batalkan hanya **menunggu entry**, aset dan timeframe sama. Sinyal yang sudah entry tetap dipantau.                                                                                                                                                      |
| TP                   | Sinyal **selesai segera pada TP1**; TP2/TP3 tetap informasi tambahan. SL dapat mengakhiri lebih dulu jika urutan tick teramati menunjukkan SL pertama.                                                                                                   |
| OHLC ambigu          | Jangan memilih TP atau SL dari candle yang menyentuh keduanya tanpa urutan tick. Status **ambigu**, hasil tidak diketahui; tick setelah gap tidak membuktikan urutan sentuhan sebelumnya.                                                                |
| Lintas timeframe     | Berjalan mandiri, termasuk arah berlawanan; tampilkan peringatan konflik.                                                                                                                                                                                |
| Invalidasi struktur  | Gunakan SL dahulu; pembatalan struktur otomatis **tetap nonaktif**.                                                                                                                                                                                      |
| AI gagal/abstain     | Mayoritas memerlukan minimal tiga suara **searah**. Tie-breaker hanya untuk empat suara valid, tepat **2 LONG–2 SHORT**; gagal/abstain tidak digantikan scanner.                                                                                         |
| SMC/ICT              | Swing dikonfirmasi oleh **3 candle kiri dan kanan** secara default; sensitivitas dapat diubah admin. BOS = close melewati swing; CHoCH = break pertama melawan tren; FVG = gap wick tiga candle; order block = candle berlawanan terakhir sebelum break. |
| Volume emas kosong   | Gunakan proxy perpetual emas **yang kontraknya diverifikasi tersedia**. Jika proxy gagal/tidak cocok timeframe atau waktu candle, kelompok abstain. Harga proxy tidak menjadi harga acuan spot.                                                          |
| Karakter kantor      | **11 inti + 2 pendukung**, IT dan resepsionis; total **13 karakter**.                                                                                                                                                                                    |
| Durasi setelah entry | Tetap mengikuti 20.11: hitung mundur berhenti setelah entry teramati.                                                                                                                                                                                    |

**Ketentuan implementasi yang dapat ditelusuri:**

- Pivot strict (lebih tinggi/rendah daripada semua tetangga), baru terlihat setelah seluruh candle kanan close; tidak memakai informasi masa depan. Satu pivot menghasilkan satu break. Chart dan scanner memakai fungsi yang sama, pada candle closed.
- Jam entry emas menyimpan sisa milidetik, titik waktu evaluasi, status dan batas freshness. Status buka berlaku paling lama 30 detik dari tick/provider yang segar; periode setelah batas itu dianggap tidak diketahui dan dijeda. Restart memakai state tersimpan, bukan reset budget.
- Sinyal lama tanpa jam entry emas diinisialisasi dari sisa deadline lama; waktu tutup historis yang tidak tercatat **tidak direkonstruksi**.
- Candle ambigu yang terjadi sebelum sebuah exit baru teramati dapat mengubah hasil keseluruhan menjadi tidak diketahui; peristiwa harga exit lama tetap tersimpan untuk audit. Candle yang baru menyentuh level lain **setelah exit tick yang diketahui** tidak membatalkan hasil tersebut.
- Publikasi dan pembatalan ditulis dalam satu batch D1. Perubahan status menyimpan alasan, pengganti sinyal, waktu, dan harga teramati bila tersedia; harga yang tidak teramati disimpan null.
- Kunci API tetap terenkripsi di D1 dan write-only di UI; hanya master key enkripsi sebagai Worker secret, sesuai desain bagian 6. Rahasia tidak disimpan pada audit sinyal.

## 21. Pertanyaan Lanjutan — Belum Diputuskan

### Pertanyaan 11: Durasi berlaku sinyal per timeframe — sudah dipilih A

Pengguna **sudah memilih A pada 12 Oktober 2026**, dengan hitung mundur berhenti setelah entry (bagian 20.11). Opsi lain di tabel dipertahankan sebagai alternatif historis, bukan keputusan.

| Opsi         | 5m                                                         | 15m                       | H1                        | H4                        | D1                        |
| ------------ | ---------------------------------------------------------- | ------------------------- | ------------------------- | ------------------------- | ------------------------- |
| A — Pendek   | 15 menit                                                   | 45 menit                  | 3 jam                     | 12 jam                    | 3 hari                    |
| B — Seimbang | 30 menit                                                   | 90 menit                  | 6 jam                     | 24 jam                    | 5 hari                    |
| C — Panjang  | 1 jam                                                      | 3 jam                     | 12 jam                    | 48 jam                    | 7 hari                    |
| D — Adaptif  | Ditentukan menggunakan ATR, struktur pasar dan batas admin | Ditentukan secara adaptif | Ditentukan secara adaptif | Ditentukan secara adaptif | Ditentukan secara adaptif |

**Saran asisten sebelumnya:** Opsi B; pemilik kemudian memilih **A**. Pemilik kemudian mengonfirmasi durasi pasar buka saja, dengan jeda saat status provider tidak diketahui (20.12).

### Rincian yang masih terbuka sebelum produksi

- Bobot/ambang lanjutan volume, VWAP/volume profile dan derivatives, serta verifikasi akses API CFTC. COT dikonfirmasi sebagai konteks meeting AI saja, tanpa perubahan skor/arah scanner. Definisi inti SMC/ICT sudah dikonfirmasi pada 20.12.
- Verifikasi ketersediaan kontrak emas, batas rate/kuota, cakupan histori setahun, dan lisensi provider pada akun nyata.
- Pemilihan model/plan, batas biaya dan kuota harian AI, serta acceptance integrasi empat slot dan channel Discord nyata.
- Finalisasi aset karakter GLB/rig/LOD dan desain animasi; jumlah 13 karakter sudah dikunci.
- Konfigurasi Cloudflare/D1 produksi, DNS, backup/rotasi, monitoring, serta pengukuran performa dan uptime pada perangkat target.

## 22. Status Dokumen

**Draf v2 — sedang difinalisasi melalui tanya jawab.** Bagian 20 memuat keputusan yang sudah dikonfirmasi; bagian 21 tidak boleh diperlakukan sebagai spesifikasi final. Pembuatan draf awal tidak mengubah repository. Pada 12 Oktober 2026 coding dilanjutkan sesuai bagian 20 dan keputusan 20.11–20.12; deployment produksi belum dilakukan.


### Konfirmasi lanjutan COT — 12 Oktober 2026

Pemilik memilih COT sebagai konteks meeting AI XAUUSD saja; tidak mengubah skor atau arah scanner. Implementasi memakai CFTC Disaggregated Futures Only, COMEX gold 088691, Managed Money. Data mingguan tersimpan di D1 dan snapshot meeting mencatat sumber, tanggal posisi (bukan tanggal rilis), pengambilan, pemeriksaan dan freshness. Data kedaluwarsa/tidak tersedia dikecualikan dari posisi dalam prompt; scanner berjalan mandiri. Akses endpoint API nyata masih perlu diverifikasi.

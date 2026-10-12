# Kantor — Trading Intelligence

Aplikasi kantor trading 3D untuk BTCUSDT dan XAUUSD, dibangun dari `PRD_Kantor_Trading_3D_Draf_v2.md`. Keputusan bagian 20 diprioritaskan. **Versi ini adalah MVP pengembangan yang dapat dijalankan, belum rilis produksi penuh.**

Pekerjaan yang belum selesai, urutan prioritas, dependensi, dan kriteria penerimaan dicatat di [rencana proyek](docs/PROJECT_PLAN.md).

## Menjalankan lokal

Prasyarat: Node.js 24 dan pnpm 11.25.0. Tidak perlu API key untuk menjelajahi demo.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm db:migrate
pnpm dev:api
```

Di terminal kedua:

```sh
pnpm dev
```

Vite berjalan pada port 5173 dan memproksikan `/api` ke Worker lokal di port 8787. Tampilan awal adalah kantor publik tanpa angka harga, arah sinyal, atau level. Pilih **Jelajahi demo** untuk mencoba kantor, chart, voting, sinyal, dan pengaturan dengan data contoh. Demo tidak melakukan panggilan AI, mengirim Discord, atau mengeksekusi order. Refresh halaman demo kembali ke tampilan publik; preferensi bahasa/kualitas tetap tersimpan.

Untuk sandbox cloud dengan direktori home tidak dapat ditulis:

```sh
export XDG_DATA_HOME=/workspace/.cache/share
export XDG_CACHE_HOME=/workspace/.cache
export XDG_CONFIG_HOME=/workspace/.cache/config
export WRANGLER_LOG_PATH=/tmp/kantor-wrangler.log
pnpm install --frozen-lockfile --store-dir /workspace/.cache/pnpm
```

Di lingkungan cloud yang mengharuskan proxy keluar, gunakan **`pnpm dev:api:proxy`** sebagai pengganti `pnpm dev:api`. Runner ini menggunakan runtime Worker asli dengan outbound HTTP dan WebSocket melalui proxy lingkungan, tetap memverifikasi TLS dan memakai CA yang tersedia. Konfigurasi, `.dev.vars`, assets, dan D1 dibaca dari konfigurasi Wrangler; source API direload ketika berubah. Restart setelah build produksi frontend atau mengubah konfigurasi/`.dev.vars`, agar manifest assets menggunakan build terbaru. Jalankan satu server API saja pada port/direktori state yang sama. Runner lokal ini tidak mengubah deployment produksi.

### Login privat lokal

```sh
node scripts/configure-local.mjs
```

Masukkan password di terminal (tidak ditampilkan). Script membuat `.dev.vars` dengan hash PBKDF2 dan kunci AES-GCM acak, tanpa menimpa file yang sudah ada. Restart Worker setelah perubahan `.dev.vars`. Login pertama menyimpan hash owner di D1. Demo tetap tersedia tanpa password dan terpisah dari API privat.

`APP_MODE=demo` adalah default. API privat awalnya kosong: fixture demo hanya berada di frontend. Ubah `APP_MODE="live"` pada `.dev.vars` hanya setelah mengatur konektivitas dan provider; ini mengaktifkan pengambilan data, scanner, AI, backfill, dan outbox Discord. Cron lokal tidak otomatis berjalan. Untuk mengujinya secara sengaja, gunakan endpoint lokal Wrangler `/cdn-cgi/local/scheduled` setelah konfigurasi live siap.

## Fitur yang dapat dicoba

- Scene prosedural React Three Fiber: dua lantai, 4 analis scanner, 4 analis AI, 2 RR, bos, serta IT/resepsionis. Ruang meeting dan RR berada di lantai 2; pantry dan musolla di lantai 1. Orbit, zoom, pemilihan lantai, kualitas, dan fallback 2D.
- Klik karakter untuk analisis; klik monitor untuk chart. Karakter berjalan melalui tangga menuju kursi rapat, menyampaikan scanner → empat AI → RR → bos, lalu kembali bekerja. Keputusan yang sudah tersimpan menjadi sumber presentasi; replay tidak memanggil AI lagi. Kamera mengikuti pembicara, dengan override manual, jeda, seek, kecepatan, dan pilihan rekaman.
- Rutinitas staf bekerja, pantry, dan musolla dengan batas pengunjung. Auto quality menyesuaikan FPS, Low tetap menampilkan semua 11 staf inti dan lantai 2, serta fallback 2D pada performa sangat rendah. Tab tersembunyi menghentikan render/presentasi; preferensi reduced motion menggunakan render sesuai kebutuhan.
- Chart candlestick 5m/15m/H1/H4/D1, EMA, Bollinger Bands, RSI, MACD, ATR, volume, BOS/CHoCH, likuiditas, garis premium/discount, serta zona FVG/order block, dan garis entry/SL/TP.
- Daftar sinyal dengan filter, detail voting/level, sentuhan entry dan target yang tercatat; riwayat meeting dan alasan penolakan.
- Pengaturan scanner/risiko, empat slot AI, koneksi API write-only, pengujian baca provider, alert harga, dan progres backfill.
- Tema gelap, tata letak ponsel, mode non-3D, dan navigasi inti Indonesia/Inggris.

## Backend

Satu Cloudflare Worker melayani Hono API dan aset statis Vite, sesuai alternatif deployment pada PRD. D1 menyimpan candle, settings berversi/audit, sesi, credential ciphertext, meeting, sinyal/status, alert/outbox, failover, derivatives, dan cursor backfill. Durable Object `MarketHub` membagi koneksi upstream dan event ke klien.

- BTC: WebSocket OKX → Binance → Bybit; REST fallback untuk startup atau upstream tidak tersedia. Primary harus stabil dua menit sebelum koneksi stream kembali dari fallback.
- Emas: OANDA pricing stream + REST/candles → Twelve Data. OANDA menggunakan `OANDA_ACCOUNT_ID`; `OANDA_ENV=practice` default, atau `live`. Status stale/closed ditampilkan. Stream NDJSON dengan heartbeat, batas ukuran pesan, reconnect/backoff, rotasi koneksi 10 menit, dan fallback REST saat stream tidak tersedia. Pemulihan dari Twelve Data menunggu OANDA stabil dua menit lewat stream/REST; status pasar tutup tidak diperlakukan sebagai stale. Integrasi akun nyata belum diverifikasi.
- Derivatives: funding/OI publik OKX → Binance → Bybit. OI hanya dibanding snapshot exchange yang sama, berumur 4–30 menit; perpindahan sumber tanpa baseline menghasilkan abstain. Proxy XAUUSDT hanya digunakan setelah metadata mengonfirmasi kontrak perpetual aktif. COT CFTC Disaggregated Futures Only untuk COMEX gold (088691) tersimpan di D1 dan menjadi konteks meeting AI saja; scanner tidak berubah. Pemeriksaan tiap 6 jam mengikuti cron live, dengan snapshot laporan/freshness pada meeting. Posisi stale/unavailable tidak dikirim ke AI; tanggal posisi dibedakan dari tanggal rilis. Akses endpoint CFTC langsung belum diverifikasi di lingkungan ini.
- Scanner pada candle close tiap 5 menit. Syarat dua kelompok searah tetap dapat memicu AI walau ada dua kelompok berlawanan. Empat slot AI dipanggil paralel; setiap provider memiliki timeout 12 detik dan satu retry, lalu pindah ke maksimal dua provider/model cadangan yang dikonfigurasi. Hasil akhir tetap satu suara per slot; riwayat percobaan tersimpan bersama voting dan terlihat pada detail, tanpa error body atau kredensial. Semua gagal menghasilkan abstain. Adapter disediakan untuk Workers AI, Gemini, Groq, OpenRouter, Mistral, Hugging Face, Cohere, NVIDIA.
- RR deterministik pada TP1 menggunakan entry terburuk. Mayoritas 3/4, atau 2–2 dengan scanner lebih kuat dan margin yang dikonfigurasi; satu SL, 1–3 TP. Level mayoritas digabung dengan median. Tidak ada endpoint order.
- Backfill awal satu tahun untuk kedua aset/lima timeframe dibuat ketika cron live pertama berjalan. Job berjalan satu halaman per alarm dan dapat dilanjutkan setelah gagal. Cakupan histori aktual bergantung provider.
- Gap recovery: pembaruan menjadwalkan rentang histori yang terlewat, termasuk lubang pada candle BTC. Job memiliki ID deterministik, diprioritaskan sebelum backfill awal, dan dapat dilanjutkan dari cursor. Scanner BTC menolak histori yang stale/tidak kontinu sesuai lookback indikator; chart menampilkan gap dan jumlah job recovery. Jeda sesi emas tidak dianggap gap internal tanpa kalender provider.
- Volume emas: jika candle spot tidak menyediakan volume, cari candle perpetual dari OKX/Binance/Bybit hanya setelah kontrak aktif diverifikasi. Seri harus closed, fresh dan selaras dengan waktu candle spot; jika tidak tersedia, abstain. Harga spot tetap berasal dari broker. OANDA H4/D1 disejajarkan UTC.
- Audit sinyal: halaman detail mengambil ledger privat dengan pagination yang stabil pada timestamp sama; menunjukkan jeda/resume jam entry, entry/TP1/SL, pembatalan, dan hasil ambigu. Demo tidak mengarang audit backend.
- Outbox Discord: retry dengan backoff, batas percobaan, dedup per signal/alert, tanpa mention Discord. Delivery belum diuji terhadap channel nyata.

## Aturan PRD yang masih terbuka

`tieMargin` default **40** sudah dikonfirmasi pada 12 Oktober 2026. Migrasi `0008` mengisi null/missing dan mencatat audit tanpa menimpa override numerik. TTL telah dikonfirmasi **opsi A** pada 12 Oktober 2026: 15 menit / 45 menit / 3 jam / 12 jam / 3 hari untuk 5m/15m/H1/H4/D1. Durasi hanya membatasi menunggu entry dan berhenti setelah entry tersentuh. Migrasi `0006` mengisi konfigurasi lama yang kosong, mempertahankan override numerik, dan mencatat audit. Admin masih dapat mengosongkan TTL untuk menonaktifkan publikasi pada timeframe tersebut.

Untuk implementasi awal, sinyal hanya dianggap masuk ketika **tick yang teramati** berada dalam zona; tidak mengarang sentuhan dari candle atau gap sampling. BTC memakai deadline kalender; emas memakai budget waktu pasar buka yang tersimpan, dijeda saat provider menyatakan tutup atau status/freshness tidak diketahui. Hitung mundur berhenti setelah entry. Sinyal selesai pada **TP1**, atau SL jika tick yang teramati menunjukkan SL terlebih dahulu. Sinyal berlawanan membatalkan hanya yang menunggu entry pada aset/timeframe sama; lintas timeframe berjalan mandiri dengan peringatan. Pembatalan struktur otomatis nonaktif sesuai pilihan pemilik. Candle TP1/SL tanpa urutan tick menghasilkan status **ambigu**, tidak diputuskan dari tick yang datang setelah gap. Audit harga sebelumnya tetap dipertahankan. Definisi SMC/ICT yang dikonfirmasi digunakan bersama oleh scanner/chart, tanpa memakai pivot sebelum candle kanan close.

## Validasi

```sh
pnpm typecheck
pnpm test
pnpm build
```

Tes memeriksa aturan voting/RR, tie-breaker, kuorum, abstain, status tick, indikator, struktur awal, kriptografi, batas webhook, dan lifecycle WebSocket upstream dengan transport mock. Smoke browser yang disertakan membutuhkan Python Playwright dan Chromium sistem:

```sh
python tests/browser_smoke.py
python tests/meeting_smoke.py
python tests/alert_smoke.py
python tests/lifecycle_smoke.py
```

Jalankan kedua server sebelum smoke browser. Screenshot disimpan di `test-results/`, yang diabaikan Git. Tes browser memeriksa privasi publik, perpindahan lantai, karakter, chart/indikator, alert, filter, detail sinyal/meeting, pengaturan, bahasa, dan responsivitas 390 px. Smoke alert memeriksa edit numerik, validasi harga, drag desktop/sentuhan ponsel, batal/konfirmasi, keyboard, isolasi aset, dan bahwa demo tidak mengirim perubahan ke API privat.

318 tes otomatis lulus. Smoke meeting memeriksa seluruh pembicara, kamera, penolakan scanner yang melewati AI, replay, jeda tab, reduced motion, serta reconnect dan penyaringan stream publik. Untuk menguji build produksi, tambahkan `KANTOR_BASE_URL=http://127.0.0.1:8787` pada smoke meeting.

Alert aktif yang belum terpicu ditampilkan sebagai garis pada chart. Geser pegangan garis untuk memilih level baru lalu konfirmasikan di formulir, atau gunakan tombol **Ubah alert** untuk mengisi harga langsung. Enter/Space pada pegangan membuka editor yang sama. Menutup formulir mempertahankan level tersimpan. Alert terpicu/nonaktif tidak bisa diedit atau diaktifkan ulang melalui perubahan harga; buat alert baru bila diperlukan. Mode demo hanya mengubah state sesi lokal, sedangkan workspace privat menyimpan perubahan di D1.

Enam tes baca BTC dengan provider nyata berhasil untuk ticker dan seluruh timeframe. Tes jaringan ini opsional dan terpisah dari suite default:

```sh
NODE_USE_ENV_PROXY=1 KANTOR_LIVE_SMOKE=1 pnpm exec vitest run apps/api/src/market-live.test.ts
```

Worker live juga diperiksa dengan konfigurasi dan database sementara terpisah, tanpa key AI, cron, atau Discord: tick BTC melalui stream Bybit cadangan tersimpan di D1, dan event publik tidak memuat harga. `pnpm dev:api` biasa gagal melakukan DNS outbound di sandbox ini; runner proxy memperbaiki jalur koneksi tersebut. Keberhasilan ini belum membuktikan pemulihan primary di akun produksi. **Emas/AI dengan akun nyata, histori setahun, Cloudflare remote, latency, lisensi data, FPS HP, dan uptime belum terverifikasi**. Lihat [status implementasi](docs/IMPLEMENTATION.md) untuk cakupan yang tersisa.

## Deployment Cloudflare

Panduan langkah demi langkah tersedia di [Deploy produksi dan setting live](docs/DEPLOY_PRODUKSI_DAN_LIVE.md), termasuk secret, provider, aktivasi cron, acceptance, keterbatasan CI/CD saat ini dan rollback.

Pipeline GitHub Actions untuk CI, smoke browser, dan deployment staging/produksi dijelaskan di [panduan CI/CD](docs/CI_CD.md). CD membutuhkan konfigurasi GitHub Environments dan repository variable `CLOUDFLARE_DEPLOY_ENABLED=true`; production dipicu manual. Kedua target mulai dalam mode demo.

Belum dilakukan deployment dari sesi implementasi. Untuk produksi:

1. Autentikasi Wrangler ke akun Cloudflare pemilik. Buat D1 `kantor-db`, lalu ganti `database_id` placeholder di `wrangler.jsonc` dengan ID sebenarnya.
2. Tetapkan secrets `ADMIN_PASSWORD_HASH` dan `ENCRYPTION_KEY` melalui penyimpanan secret Cloudflare. Format hash dibuat oleh script lokal; kunci AES berupa 64 digit hex. Jangan commit `.dev.vars` atau memasukkan kredensial ke frontend. Jangan mengganti kunci enkripsi tanpa migrasi ciphertext.
3. Opsional: tambahkan `"ai": { "binding": "AI" }` di konfigurasi untuk Workers AI. Tetapkan `OANDA_ACCOUNT_ID` dan `OANDA_ENV` jika memakai OANDA pricing. Atur model/plan dan API key melalui halaman API setelah login.
4. Terapkan migrasi D1 remote secara sengaja, build, lalu deploy Worker. Untuk pengujian pertama pertahankan `APP_MODE=demo`; aktifkan live sesudah memvalidasi konfigurasi, key, aturan scanner, TTL, dan lisensi.
5. Uji koneksi baca provider di UI, histori/pagination, stream/failover, quorum/timeout, outbox, dan performa di perangkat target. Cloudflare Workers websocket port dan endpoint provider perlu diuji pada akun deployment.

Subdomain `muidsoft.com` dapat dipasang setelah pemilik menentukan nama dan memberikan akses DNS. Deployment aplikasi dan perubahan DNS dilakukan terpisah dari penyimpanan kode di GitHub.

Frontend telah diperbarui menjadi mobile first: navigasi bawah lima halaman, kartu sinyal pada ponsel, scanner satu kolom, kontrol sentuh 44 px, drawer keyboard/Escape, dialog bernama, dan tema graphite/mint yang konsisten dengan chart. Smoke desain memeriksa 320/360/390/430 px, tablet 768 px serta desktop 1440 px; seluruh enam smoke browser lulus. Rincian temuan dan batas audit tersedia di `docs/FRONTEND_AUDIT.md`.

Kantor 3D mendapat pembaruan material/pencahayaan, furniture, detail karakter, framing kamera per floor/aspect, shared monitor texture dan geometry instancing. Semua profil mempertahankan 13 karakter; scene berhenti di luar viewport dan fullscreen mendukung keyboard. Review dan biaya render tersedia di `docs/3D_AUDIT.md`; performa perangkat fisik belum diukur.

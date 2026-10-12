# Panduan deploy produksi dan pengaturan live — Kantor Trading

Disusun 12 Oktober 2026 berdasarkan kode aplikasi saat ini. Semua perintah dijalankan dari root proyek `kantorbtc`. Panduan ini tidak menjalankan deployment, membuat resource Cloudflare, mengaktifkan inference AI, atau mengirim pesan Discord.

## 1. Arsitektur dan kebutuhan

Aplikasi dihosting sebagai **satu Cloudflare Worker dengan Static Assets**, bukan frontend Pages terpisah. Worker menyajikan `dist/`, API Hono, WebSocket privat/publik, D1, dan Durable Object `MarketHub`. D1 menyimpan konfigurasi, credential terenkripsi, candle, meeting, sinyal/audit, backfill, COT dan outbox Discord. Cron live berjalan setiap lima menit; alarm Durable Object menangani pemantauan/recovery dan outbox.

Siapkan:

- Account Cloudflare dengan akses Workers, D1 dan SQLite Durable Objects; pilih plan/limit sesuai penggunaan. Workers AI opsional, dengan kuota/billing yang sesuai.
- Node.js 24, pnpm sesuai `packageManager` proyek, dan Python 3 untuk langkah pembuatan secret di bawah. Perintah shell mengasumsikan Bash/macOS/Linux atau WSL.
- Worker dan D1 produksi yang berbeda dari staging. Jika resource produksi sudah ada, gunakan resource tersebut; jangan membuat database baru sebagai pengganti tanpa rencana migrasi data.
- Akses provider AI/model yang dipilih. Untuk emas, OANDA account/token dan/atau paket Twelve Data yang menyediakan XAU/USD serta timeframe yang dibutuhkan.
- Webhook Discord opsional. Gunakan kanal privat khusus bila ingin mengaktifkan pengiriman.

Aplikasi menghasilkan analisis/sinyal; tidak mengeksekusi order. `APP_MODE=live` adalah mode aplikasi, sedangkan `OANDA_ENV=live` memilih endpoint account OANDA. Kedua pengaturan tersebut terpisah.

## 2. Persiapan kode dan account

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm test
pnpm build
pnpm exec wrangler login
pnpm exec wrangler whoami
pnpm exec wrangler d1 list
```

Pastikan account hasil `whoami` adalah account tujuan. Suite saat panduan dibuat: 318 tes otomatis dan enam smoke browser lulus; tes jaringan opsional terpisah. Bila Playwright/Chromium tersedia, periksa browser sebelum deploy:

```bash
bash scripts/ci-browser.sh
```

Runner browser hanya untuk backend lokal mode demo, bukan untuk mengetes database produksi. Hentikan server lokal pada port 5173/8787 sebelum menjalankannya.

Jika D1 produksi belum ada:

```bash
pnpm exec wrangler d1 create kantor-db
```

Catat UUID dari hasil perintah, lalu masukkan ke konfigurasi di langkah berikutnya. Account ID/UUID/nama di workflow lama bukan bukti bahwa resource tersebut milik account yang sedang digunakan; isi target secara eksplisit.

## 3. Konfigurasi produksi terpisah

Buat `wrangler.production.jsonc` **di root proyek**, sejajar `wrangler.jsonc`. Ganti placeholder account dan D1 dengan nilai nyata. Nama Worker harus cocok dengan resource yang ingin digunakan.

Contoh berikut memulai produksi dalam mode demo dengan cron nonaktif:

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "kantor-trading",
  "account_id": "<ACCOUNT_ID_CLOUDFLARE>",
  "main": "apps/api/src/index.ts",
  "compatibility_date": "2026-10-12",
  "workers_dev": true,
  "assets": {
    "directory": "./dist",
    "binding": "ASSETS",
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/api/*"],
  },
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "kantor-db",
      "database_id": "<UUID_D1_PRODUKSI>",
      "migrations_dir": "apps/api/migrations",
    },
  ],
  "durable_objects": {
    "bindings": [{ "name": "MARKET_HUB", "class_name": "MarketHub" }],
  },
  "migrations": [{ "tag": "v1", "new_sqlite_classes": ["MarketHub"] }],
  "ai": { "binding": "AI" },
  "observability": { "enabled": true },
  "triggers": { "crons": [] },
  "vars": { "APP_MODE": "demo", "OANDA_ENV": "practice" },
}
```

Tanggal compatibility pada contoh lebih baru daripada tanggal di konfigurasi awal proyek. Uji tanggal ini di staging sebelum dipakai pada account produksi; bila perlu gunakan tanggal konfigurasi yang telah Anda verifikasi. Jangan menaikkan compatibility date bersama perubahan besar tanpa pemeriksaan staging.

Binding `AI` hanya diperlukan untuk Workers AI. Bila tidak digunakan, hapus baris `ai` dan ganti slot Workers AI dengan provider lain di UI. Nama `DB`, `MARKET_HUB`, `ASSETS`, class `MarketHub`, serta direktori migrasi harus dipertahankan. Jangan mengulang/mengubah tag migrasi Durable Object `v1` untuk deployment rutin.

## 4. Backup, migrasi, dan deploy awal

Untuk database produksi **yang sudah berisi data**, buat backup terlebih dahulu:

```bash
mkdir -p work/backups
pnpm exec wrangler d1 export DB --remote \
  --config wrangler.production.jsonc \
  --output work/backups/kantor-sebelum-deploy.sql
```

Pilih nama backup baru pada setiap deploy; simpan backup dengan akses terbatas. Backup D1 yang memuat credential terenkripsi harus dipasangkan dengan master key yang benar agar credential dapat dipulihkan.

Periksa dan terapkan migrasi:

```bash
pnpm exec wrangler d1 migrations list DB --remote --config wrangler.production.jsonc
pnpm exec wrangler d1 migrations apply DB --remote --config wrangler.production.jsonc
```

Saat ini ada sembilan migrasi, `0001`–`0009`; migrasi terakhir menambahkan COT. Gunakan migration runner, jangan mengeksekusi ulang seluruh SQL secara manual pada database yang sudah dipakai. Error pada migrasi harus diselesaikan sebelum melanjutkan.

```bash
pnpm build
pnpm exec wrangler deploy --dry-run --config wrangler.production.jsonc
pnpm exec wrangler deploy --config wrangler.production.jsonc
```

Catat URL HTTPS dari hasil deploy. Periksa health memakai URL tersebut, bukan URL contoh:

```bash
export KANTOR_URL='https://kantor-trading.SUBDOMAIN_ACCOUNT.workers.dev'
curl --fail --silent --show-error "$KANTOR_URL/api/health"
```

Hasil awal harus memuat `status: "ok"`, `app: "kantor"`, `mode: "demo"`. Health hanya membuktikan Worker menjawab; belum membuktikan seluruh migrasi, provider, model AI atau stream bekerja.

## 5. Secret admin dan master key

| Nama                                | Tempat                                   | Fungsi                                            |
| ----------------------------------- | ---------------------------------------- | ------------------------------------------------- |
| `ADMIN_PASSWORD_HASH`               | Worker Secret                            | Password admin dalam format hash aplikasi         |
| `ENCRYPTION_KEY`                    | Worker Secret                            | AES-GCM master key, tepat 64 digit hex            |
| `OANDA_ACCOUNT_ID`                  | Worker Secret, bila memakai stream OANDA | Account pricing yang sesuai token/environment     |
| `APP_MODE`                          | `vars` pada config produksi              | `demo` atau `live`                                |
| `OANDA_ENV`                         | `vars` pada config produksi              | `practice` atau `live`                            |
| API key AI/emas dan webhook Discord | UI privat → Koneksi API                  | Disimpan terenkripsi di D1, bukan `vars` frontend |

### Membuat secret untuk instalasi baru

Jalankan contoh ini **hanya untuk instalasi baru yang belum mempunyai master key dan user admin di D1**. Jangan membuat master key baru untuk database yang sudah mempunyai credential terenkripsi.

```bash
mkdir -p work
python3 - <<'PY'
import base64, getpass, hashlib, json, os, secrets
from pathlib import Path

path = Path('work/production-secrets.json')
if path.exists():
    raise SystemExit('File secret sudah ada; gunakan secret yang tersimpan.')
password = getpass.getpass('Password admin produksi, minimal 12 karakter: ')
confirm = getpass.getpass('Ulangi password: ')
if len(password) < 12 or password != confirm:
    raise SystemExit('Password terlalu pendek atau konfirmasi tidak cocok.')
salt = secrets.token_bytes(16)
derived = hashlib.pbkdf2_hmac('sha256', password.encode(), salt, 100000, 32)
b64 = lambda value: base64.b64encode(value).decode()
value = {
    'ADMIN_PASSWORD_HASH': f'pbkdf2$100000${b64(salt)}${b64(derived)}',
    'ENCRYPTION_KEY': secrets.token_hex(32),
}
fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(fd, 'w') as stream:
    json.dump(value, stream)
print('Secret dibuat di file privat; nilainya tidak dicetak.')
PY
```

Aplikasi saat ini menerima format PBKDF2 SHA-256 **100.000 iterasi**. Jangan mengganti format/iterasi sendiri tanpa memperbarui verifier. Folder `work/` sudah diabaikan Git; tetap simpan master key di secret vault/backup terenkripsi, bukan chat atau log CI.

Upload ke Worker yang sudah dibuat:

```bash
pnpm exec wrangler secret bulk work/production-secrets.json --config wrangler.production.jsonc
pnpm exec wrangler secret list --config wrangler.production.jsonc
```

`secret list` hanya menampilkan nama secret. Setelah backup aman tersimpan di vault, file lokal sementara dapat dihapus. Jangan menggunakan `echo` atau argumen CLI untuk menaruh nilai secret.

Untuk OANDA:

```bash
pnpm exec wrangler secret put OANDA_ACCOUNT_ID --config wrangler.production.jsonc
```

Isi account ID pada prompt interaktif. Token OANDA dimasukkan lewat UI Koneksi API. Untuk instalasi yang sudah ada, gunakan secret lama/vault; jangan menjalankan generator ulang.

**Password admin yang sudah dibuat di D1 tidak otomatis berubah saat secret diganti.** Baris `users` yang sudah ada menjadi sumber password login. Rotasi password memerlukan update hash pada user D1 dan pencabutan sesi yang sesuai; jangan menghapus database untuk mereset password. Rotasi `ENCRYPTION_KEY` memerlukan migrasi ulang ciphertext, bukan sekadar mengganti secret.

## 6. Login workspace privat dan setting provider

Buka URL aplikasi, pilih **Masuk**, lalu gunakan password produksi. Jangan pilih **Jelajahi demo** untuk mengatur provider: mode demo tidak menyimpan API key ke backend.

Di **Pengaturan → Koneksi API**, hubungkan provider yang diperlukan dan gunakan tombol tes koneksi baca.

| Provider     | Yang disiapkan                                         | Catatan                                                                    |
| ------------ | ------------------------------------------------------ | -------------------------------------------------------------------------- |
| Workers AI   | Binding `AI` dan akses model/kuota Cloudflare          | Tidak membutuhkan API key UI; tes hanya memeriksa binding, bukan inference |
| Gemini       | API key, model ID yang dapat diakses account           | Tes daftar model bukan jaminan kuota inference                             |
| Groq         | API key dan model ID                                   | Pastikan model masih tersedia pada account                                 |
| NVIDIA       | API key dan model ID endpoint integrate NVIDIA         | Gunakan model yang kompatibel dengan adapter chat                          |
| Cohere       | API key dan model ID chat                              | Pastikan account mempunyai akses model yang dipilih                        |
| Hugging Face | Token dan model/provider routing yang tersedia         | Tes identitas token bukan bukti model inference tersedia                   |
| Mistral      | API key dan model ID                                   | Periksa akses/billing model                                                |
| OpenRouter   | API key, credit/plan, model ID                         | Opsional selain enam provider pilihan di atas                              |
| OANDA        | Token sesuai `OANDA_ENV`, account ID dan akses XAU_USD | Account list berhasil belum membuktikan stream/instrumen tersedia          |
| Twelve Data  | API key/paket XAU/USD                                  | Digunakan untuk fallback; kuota histori/timeframe bergantung paket         |
| Discord      | Webhook HTTPS kanal tujuan                             | Tes UI membaca webhook; tidak mengirim pesan uji                           |

Jangan meletakkan credential di `VITE_*`, source frontend, screenshot atau repository. UI hanya menampilkan empat karakter terakhir credential.

### Susunan AI

Di **Susunan AI**, isi empat slot. Masing-masing memiliki provider, model ID dan maksimal dua cadangan berurutan. Model ID diisi sesuai account provider; pilihan provider tidak otomatis mengganti model lama. Konfigurasi tidak boleh mengulang pasangan provider/model dalam satu slot.

Jika Workers AI tidak digunakan, ganti slotnya. Siapkan fallback yang mempunyai credential/model valid. Empat slot berjalan paralel ketika scanner memicu analisis; tiap target dapat dicoba ulang sekali. Cadangan dapat meningkatkan jumlah permintaan dan biaya. Saat semua target gagal, slot abstain, bukan suara netral. UI dan tes koneksi belum menyediakan pembatas biaya harian terpadu; gunakan limit/budget di provider dan pantau pemakaian.

### Data BTC dan emas

BTC memakai sumber publik OKX → Binance → Bybit. Sumber aktual dapat berbeda akibat akses jaringan/region. Gold pricing memakai stream OANDA dengan REST/recovery dan Twelve Data fallback. Untuk memakai endpoint OANDA account live, ubah `OANDA_ENV` menjadi `live`; account/token/instrumen harus sesuai.

Spot XAUUSD tetap menjadi harga acuan. Funding/OI dan volume proxy emas hanya berasal dari kontrak perpetual yang metadata-nya terverifikasi; proxy tidak mengganti harga spot. COT memakai laporan mingguan CFTC COMEX gold, hanya menjadi konteks meeting AI. COT tidak membutuhkan secret; data stale/unavailable tidak membawa posisi ke prompt AI dan tidak mengubah skor scanner. API CFTC langsung tetap perlu diverifikasi pada deployment Anda.

### Scanner dan alert

Periksa default yang sudah dikonfirmasi:

- Minimal dua kelompok scanner searah, mayoritas AI minimal tiga suara searah. Tie-breaker hanya empat suara valid 2 LONG–2 SHORT, margin default 40 dengan syarat kelompok scanner yang sah.
- RR minimum dievaluasi pada TP1. Sinyal selesai pada TP1, atau SL; urutan TP/SL historis yang tidak diketahui dicatat ambigu.
- TTL menunggu entry: 5m 900 detik; 15m 2.700; H1 10.800; H4 43.200; D1 259.200. TTL berhenti setelah entry. Nilai kosong menonaktifkan publikasi pada timeframe tersebut.
- Emas memakai status pasar provider; closed/unknown menjeda TTL. Status unknown bukan bukti pasar buka.
- Sinyal berlawanan hanya membatalkan sinyal lama yang menunggu entry pada asset/timeframe sama. Timeframe berbeda mandiri dengan peringatan konflik.

Untuk aktivasi awal, nonaktifkan **Alert Discord** sinyal/harga terlebih dahulu dan jangan hubungkan webhook sampai alur live diperiksa. Mengaktifkan kembali webhook dapat mengirim outbox pending yang sudah terbentuk; periksa antrean terlebih dahulu.

## 7. Mengaktifkan mode live

Pastikan login privat, credential, model, account emas, migrasi dan batas biaya telah diperiksa. Ubah hanya bagian berikut pada `wrangler.production.jsonc`; pertahankan binding/resource lainnya:

```jsonc
"triggers": { "crons": ["*/5 * * * *"] },
"vars": { "APP_MODE": "live", "OANDA_ENV": "practice" }
```

Ganti `practice` ke `live` bila memakai account OANDA live. Jangan memasukkan `OANDA_ACCOUNT_ID` ke frontend; secret tetap berlaku pada deploy berikutnya.

```bash
pnpm build
pnpm exec wrangler deploy --dry-run --config wrangler.production.jsonc
pnpm exec wrangler deploy --config wrangler.production.jsonc
curl --fail --silent --show-error "$KANTOR_URL/api/health"
pnpm exec wrangler tail --config wrangler.production.jsonc
```

Health harus menunjukkan `mode: "live"`. Perubahan cron dapat membutuhkan waktu untuk tersebar, sehingga putaran pertama tidak harus langsung muncul. Scheduled handler memeriksa COT terlebih dahulu, lalu meminta MarketHub scan; ketika sudah aktif, alarm melakukan pemantauan periodik.

Jangan memakai `pnpm deploy` tanpa `--config` untuk alur ini: script tersebut memakai konfigurasi default, bukan file produksi terpisah. Untuk deploy berikutnya, selalu gunakan command explicit di atas.

## 8. Acceptance setelah live

Masuk ke workspace privat, kemudian periksa:

1. **Harga dan stream:** BTC/emas menunjukkan sumber/status/waktu yang masuk akal. Tidak ada harga yang terus dianggap live setelah koneksi stale. Pilih saat pasar emas buka untuk memeriksa stream.
2. **Chart:** candle tertutup tersedia untuk 5m/15m/H1/H4/D1; status gap/recovery sesuai. Volume spot kosong tidak menghasilkan volume proxy palsu.
3. **Meeting:** scanner tercatat pada putaran cron. AI hanya dipanggil saat syarat scanner terpenuhi; hasil provider/model, retry/fallback dan abstain tercatat. Tidak adanya panggilan AI pada scanner lemah bukan error.
4. **Sinyal:** publication, clock, entry, TP1/SL, expiry, pembatalan dan ambiguity sesuai audit. Periksa emas closed/unknown dan konflik lintas timeframe.
5. **COT:** tanggal posisi, tanggal fetch/check, freshness dan sumber tampil pada detail meeting XAUUSD. Tanggal posisi bukan tanggal rilis.
6. **Backfill:** sepuluh job awal untuk dua aset/lima timeframe terbentuk otomatis; progres/cursor bertambah. Pengisian setahun bersifat bertahap, bukan satu request. Paket provider dapat membatasi coverage/kuota.
7. **Privasi:** incognito tanpa login hanya melihat suasana kantor. Endpoint `/api/signals`, `/api/meetings`, `/api/market` dan COT privat menolak akses tanpa sesi.
8. **Discord:** setelah hasil di atas benar, hubungkan webhook kanal uji privat, periksa outbox pending, lalu aktifkan jenis alert yang diperlukan. Pengiriman pertama adalah pesan nyata; pastikan kanal tujuan benar.

Query operasional berikut hanya membaca status dan tidak mengeluarkan API key/ciphertext atau isi pesan privat:

```bash
pnpm exec wrangler d1 execute DB --remote --config wrangler.production.jsonc \
  --command "SELECT symbol,updated_at FROM quotes ORDER BY symbol;"
pnpm exec wrangler d1 execute DB --remote --config wrangler.production.jsonc \
  --command "SELECT symbol,tf,status,rows_saved,error FROM backfill_jobs ORDER BY updated_at DESC LIMIT 10;"
pnpm exec wrangler d1 execute DB --remote --config wrangler.production.jsonc \
  --command "SELECT status,COUNT(*) AS jumlah FROM alert_outbox GROUP BY status;"
pnpm exec wrangler d1 execute DB --remote --config wrangler.production.jsonc \
  --command "SELECT report_date,fetched_at FROM cot_reports ORDER BY report_date DESC LIMIT 2;"
```

Backfill gagal dapat dilanjutkan melalui tab **Histori & backfill**, dari cursor yang tersimpan. Jangan menghapus candle atau job untuk sekadar mengulang koneksi provider.

## 9. Domain khusus — opsional

Mulai dari URL `workers.dev` hingga acceptance berjalan. Jika domain dikelola di Cloudflare, tambahkan Custom Domain melalui dashboard Worker atau tambahkan bagian ini ke config produksi:

```jsonc
"routes": [{ "pattern": "kantor.example.com", "custom_domain": true }]
```

Ganti hostname dengan domain milik Anda. Pastikan zone, DNS/konflik record, sertifikat dan host benar sebelum deploy. Binding assets dan API tetap pada Worker yang sama. Setelah domain aktif, buka URL baru dan login kembali; cookie sesi bersifat host-specific. Perbarui `KANTOR_URL` dan URL health yang dipakai CI/monitoring.

## 10. Catatan penting CI/CD yang sudah ada

Saat ini `scripts/configure-deploy.mts` **memaksa `APP_MODE=demo`**, dan workflow `.github/workflows/ci.yml` hanya menerima health mode demo. Deploy lewat pipeline tersebut dapat mengembalikan Worker produksi live menjadi demo, meskipun file produksi manual sudah memakai live. Workflow juga mempunyai fallback identitas resource; isi GitHub Environment variables secara eksplisit agar target tidak bergantung fallback.

Untuk menggunakan panduan manual ini, pertahankan job CI tes/build tetapi jangan menjalankan job CD terhadap Worker live yang sama sebelum pipeline disesuaikan. Repository variable `CLOUDFLARE_DEPLOY_ENABLED=false` mencegah job deploy pada workflow saat ini; tes/build tetap berjalan. File `wrangler.production.jsonc` tidak dibaca otomatis oleh generator CI.

Jika hendak mengotomatisasi live, ubah generator, validasi health, penyimpanan account/D1/Worker per environment, dan pengaturan approval production secara bersama; jangan hanya mengganti variable pada dashboard. Referensi CI/CD di repo: `docs/CI_CD.md`.

## 11. Menghentikan live dan pemulihan

Untuk menghentikan pekerjaan live baru, ubah config produksi menjadi:

```jsonc
"triggers": { "crons": [] },
"vars": { "APP_MODE": "demo", "OANDA_ENV": "practice" }
```

Deploy kembali dengan `--config wrangler.production.jsonc`, periksa health mode demo dan pantau log/quote timestamp hingga versi baru berlaku. Menonaktifkan cron saja tidak menghentikan alarm Durable Object; `APP_MODE` juga harus demo. Request yang sudah berjalan dapat selesai selama rollout. Sinyal, job dan outbox tetap tersimpan di D1; periksa backlog sebelum mengaktifkan live kembali.

Untuk menghentikan pesan baru, matikan pengaturan alert. **Pengaturan ini tidak membatalkan outbox pending.** Jika perlu menghentikan pengiriman seketika ketika masih ada pekerjaan berjalan, nonaktifkan/revoke webhook di Discord melalui pengelolaan kanal Anda, lalu periksa rollout. Jangan menghapus audit/outbox atau merotasi master key sebagai cara pause.

Untuk mengembalikan versi Worker:

```bash
pnpm exec wrangler versions list --config wrangler.production.jsonc
pnpm exec wrangler rollback VERSION_ID_YANG_SUDAH_DIPERIKSA --config wrangler.production.jsonc
```

Rollback Worker tidak membatalkan migrasi atau perubahan data D1. Versi lama harus kompatibel dengan schema yang sudah terpasang. Pemulihan data memerlukan backup/Time Travel sesuai plan dan prosedur restore yang telah diuji; master key harus sesuai credential dalam backup. Setelah rollback/restore, periksa mode, secret, cron, health, stream dan outbox lagi.

## 12. Troubleshooting ringkas

| Gejala                                | Pemeriksaan                                                                                                |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Login belum dikonfigurasi             | Secret hash tersedia dan migrasi `users`/`sessions` telah diterapkan                                       |
| Password lama masih digunakan         | D1 sudah mempunyai user owner; secret baru tidak menimpa hash user yang ada                                |
| Credential gagal disimpan/dibaca      | `ENCRYPTION_KEY` tersedia dan cocok dengan ciphertext lama; jangan menggantinya asal                       |
| Health masih demo                     | Config yang dipakai deploy, pipeline CI yang memaksa demo, serta URL Worker yang dibuka                    |
| Health live tetapi tidak ada sinyal   | Data/candle/freshness, cron, scanner consensus, TTL, quorum AI dan RR; health bukan acceptance             |
| XAUUSD unknown/stale                  | Account ID, token/environment OANDA, akses XAU_USD, status pasar, heartbeat dan kuota fallback             |
| AI abstain                            | Model ID, credential, akses inference, kredit/rate limit, retry/fallback dan response schema               |
| COT unavailable/stale                 | Migrasi `0009`, akses publicreporting.cftc.gov, warning sync dan tanggal laporan; scanner tetap independen |
| Backfill gagal/coverage tidak lengkap | Paket histori provider, rate limit, rentang/timeframe dan cursor; gunakan resume                           |
| Discord pending/failed                | Webhook valid, akses kanal, status outbox/retry dan mode live; toggle alert tidak menghapus antrean lama   |
| Produksi berubah demo setelah deploy  | Generator/workflow CI default masih memaksa demo; gunakan sumber konfigurasi yang konsisten                |

## Referensi

- [Wrangler Workers commands — deploy, secrets, tail dan rollback](https://developers.cloudflare.com/workers/wrangler/commands/workers/)
- [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)
- [Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
- [Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
- [Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)

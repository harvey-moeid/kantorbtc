# Rencana pekerjaan yang belum selesai

Status awal: MVP kantor trading sudah berjalan lokal. Dokumen ini adalah backlog untuk melanjutkan proyek sampai siap rilis, bukan pernyataan bahwa seluruh PRD sudah selesai. Acuan: [PRD draf v2](../PRD_Kantor_Trading_3D_Draf_v2.md) dan [status implementasi](IMPLEMENTATION.md). Keputusan bagian 20 mengungguli bagian sebelumnya; bagian 21 masih memerlukan keputusan pemilik.

## Fondasi yang sudah tersedia

Kantor dua lantai dengan 11 staf inti dan 2 pendukung, presentasi meeting/replay, chart lima timeframe, scanner awal, adapter delapan provider AI, voting/RR deterministik, pelacakan sinyal, login privat, API key terenkripsi, alert/outbox, serta backfill berbasis cursor sudah dibuat. Build, 308 tes otomatis, dan smoke browser desktop/ponsel lulus pada sesi implementasi. Enam tes baca BTC nyata serta probe stream Worker terisolasi berhasil. Integrasi emas/AI/Discord dengan akun nyata dan deployment produksi belum diverifikasi.

## P0 — Kunci aturan dan persiapan integrasi

- [x] Pemilik memilih TTL opsi A dan hitung mundur berhenti setelah entry (12 Oktober 2026); default dan migrasi audit diterapkan.
- [x] Waktu pasar buka saja untuk XAUUSD, status provider/freshness, jeda saat closed/unknown, warning dan state budget persisten.
- [x] Margin 40; mayoritas minimal tiga searah, tie-breaker hanya empat valid 2–2. Default/migrasi/audit dan boundary tests tersedia.
- [x] Cancel waiting opponent pada timeframe sama, independensi timeframe dengan warning, SL tanpa invalidasi struktur otomatis, selesai pada TP1, dan hasil ambigu tanpa menebak urutan tick.
- [x] Definisi pivot kiri/kanan, close BOS, CHoCH, tiga-candle FVG, dan last-opposing order block dikunci. Scanner/chart berbagi fungsi; tes prefix memastikan tidak memakai masa depan.
- [x] Proxy volume emas verified, fallback dan alignment; tidak mengganti harga spot.
- [ ] Finalisasi bobot/fitur volume/VWAP/profile/derivatives (COT sudah dikunci sebagai konteks AI saja).
- [x] Jumlah 13 karakter (11 inti + IT/resepsionis) dikonfirmasi.
- [ ] Finalisasi aset karakter GLB/rig/LOD dan animasi akhir.
- [x] Skema JSON signal clock, exit, cancel dan status ambigu, ledger D1, serta credential D1/master Worker secret didokumentasikan pada PRD 20.12.
- [ ] Siapkan akses Cloudflare/D1, provider emas, empat slot AI, dan channel Discord; pastikan model, kuota, cakupan histori, serta lisensi penggunaan data sesuai kebutuhan.

**Selesai jika:** keputusan dicatat dan konfigurasi tervalidasi; TTL opsi A, margin 40 dan aturan 20.12 terkonfigurasi dan diaudit. Kredensial masuk melalui secret/UI privat, tanpa masuk Git atau frontend. Implementasi sementara pada `IMPLEMENTATION.md` diganti hanya setelah aturan disepakati.

## P1 — Data pasar dan histori yang andal

- [x] Tambahkan stream OANDA, reconnect/heartbeat, bounded NDJSON, status closed, REST/fallback, dan pemulihan primary dua menit. 15 tes transport/state lulus; akun nyata masih perlu acceptance.
- [ ] Uji primary BTC, fallback OKX/Binance/Bybit, koneksi ulang, stale detection, dan pemulihan primary setelah stabil pada runtime deployment.
- [x] Job recovery otomatis untuk gap histori dan lubang BTC, upsert/cursor/dedup, prioritas recovery, catatan perpindahan sumber, dan guard candle close/lookback BTC. 12 tes rekonsiliasi/backfill lulus.
- [ ] Verifikasi kalender/kelengkapan candle emas dan recovery provider pada deployment nyata.
- [ ] Jalankan backfill satu tahun untuk dua aset/lima timeframe; tangani pagination, batas provider, rate limit, resume, dan cakupan yang memang tidak tersedia.
- [x] Fallback funding/OI OKX → Binance → Bybit, baseline per sumber, freshness, dan pemeriksaan metadata kontrak emas; 8 tes lulus.
- [x] Implementasikan konteks COT mingguan CFTC untuk AI emas saja, persistensi/freshness/snapshot meeting; skor scanner tetap.
- [ ] Verifikasi endpoint CFTC dan derivatives dengan provider nyata.

**Selesai jika:** sumber/waktu/status data dapat ditelusuri, gagal provider tidak menghasilkan data palsu, resume tidak menggandakan candle, dan cakupan histori aktual terlihat di UI. Target pemulihan failover <30 detik serta latensi tick ke layar sekitar 1–2 detik diukur, bukan diasumsikan dari demo.

## P2 — Scanner, AI, dan lifecycle sinyal

- [ ] Implementasikan aturan scanner formal hasil P0, termasuk volume/VWAP/profile dan derivatives yang belum lengkap; buat fixture kasus struktur yang mewakili kondisi pasar.
- [x] Aturan status hasil P0 dan ledger privat/pagination dibuat; publikasi/cancel batch atomik, clock persisten, guard terhadap update tick lama. Pembatalan struktur nonaktif sesuai keputusan pemilik.
- [ ] Verifikasi empat slot AI dengan akun nyata: payload yang sama, panggilan paralel, schema output, timeout/retry, abstain, kuorum, dan RR pada entry terburuk/TP1.
- [x] Maksimal dua provider/model cadangan per slot, timeout/retry terikat, skema ID/provider/model bersama, dan audit percobaan pada voting. 9 tes panggilan, 5 tes API privat, serta smoke kontrol UI lulus.
- [ ] Tambahkan batas biaya/kuota provider; jumlah percobaan terikat belum berarti ada anggaran biaya per akun.
- [ ] Periksa katalog model/plan tiap adapter; hapus asumsi model yang tidak tersedia pada akun pengguna.
- [ ] Uji alur penuh candle close → scanner → AI → RR → bos → entry/TP/SL/expiry/cancel, termasuk penolakan dan restart Worker.

**Selesai jika:** keputusan deterministik dan audit bisa direproduksi; replay tidak memanggil AI lagi; schema gagal menghasilkan abstain. Target gagal parse suara AI <2% dievaluasi dari pengujian akun nyata. Tidak ada eksekusi order.

## P3 — Chart, alert, bahasa, dan kantor

- [x] Visual BOS/CHoCH, likuiditas, midpoint premium/discount dan FVG/OB memakai definisi shared dan candle closed.
- [ ] Tambahkan volume profile dan snapshot/anotasi analisis historis tersimpan.
- [x] Tambahkan garis alert aktif pada chart, drag mouse/sentuhan dengan konfirmasi, edit numerik/keyboard, serta API privat untuk menyimpan level tanpa mengaktifkan ulang alert terpicu. Diperiksa dengan tes API/state dan smoke Chromium desktop/390 px.
- [ ] Tambahkan indikator status data/gap yang konsisten di semua panel.
- [ ] Tambahkan alert volatilitas ekstrem, penolakan sinyal, serta failover; ketiganya nonaktif secara default dan memiliki kontrol cooldown/dedup.
- [ ] Finalisasi penggunaan Cloudflare Queue sesuai PRD atau catat keputusan arsitektur pengganti; uji outbox/retry terhadap channel Discord nyata yang ditentukan pemilik.
- [ ] Selesaikan terjemahan ID/EN seluruh panel, detail, validasi, label aksesibilitas, dan pesan Discord; pertahankan bahasa alasan AI sesuai pengaturan.
- [ ] Buat/optimalkan aset karakter GLB dengan rig dan LOD, animasi duduk/berjalan/presentasi/reaksi, serta detail aktivitas staf yang belum tercakup model prosedural.
- [ ] Periksa akses keyboard, ukuran tap, kontras, reduced motion, mode non-3D, dan kesetaraan fungsi Low/Medium/High.

**Selesai jika:** bahasa konsisten dari UI sampai notifikasi, alert tidak ganda saat retry/restart, tidak ada data privat di kantor publik, dan fungsi rapat/lantai 2 tetap tersedia pada profil rendah. Target pengiriman Discord <5 detik setelah keputusan final diukur dengan channel pengujian.

## P4 — Performa, keamanan, dan kesiapan operasi

- [ ] Ukur Medium pada HP kelas menengah nyata, Android/iOS, serta jaringan 4G: target ≥30 FPS dan muat awal <5 detik. Optimalkan draw call, LOD, pencahayaan, ukuran bundle/aset sesuai hasil pengukuran.
- [ ] Uji banyak klien pada satu MarketHub, restart/hibernasi, sesi kedaluwarsa, tab tersembunyi, koneksi lemah, dan pemulihan setelah upstream putus.
- [ ] Review otorisasi setiap API/stream, cookie/origin/rate limit, output publik, redaksi log, dan penyimpanan credential sebelum membuka akses Internet.
- [ ] Susun dan uji backup/restore D1, rotasi master key dengan migrasi ciphertext, migrasi skema, serta prosedur rollback.
- [ ] Tambahkan monitoring freshness/latency/failover, error AI/parse, kuota/biaya, outbox tertunda, dan health check produksi.
- [ ] Ukur uptime data dengan periode pengamatan yang dicatat; target PRD ≥99% belum dibuktikan oleh smoke lokal.

**Selesai jika:** ada laporan pengukuran perangkat/jaringan, uji pemulihan, review keamanan, dan runbook operasi. Setiap target yang belum tercapai dicatat sebagai blocker rilis.

## P5 — Deployment dan penerimaan rilis

- [ ] Buat D1 produksi, ganti ID placeholder, tetapkan secrets, dan tambahkan binding Workers AI bila digunakan.
- [ ] Terapkan migrasi remote dan deploy staging; mulai dengan mode demo sebelum mengaktifkan live dengan konfigurasi tervalidasi.
- [ ] Jalankan acceptance staging untuk login/logout, chart/histori, meeting/sinyal, public/private, alert, failover, dan restart.
- [x] Tambahkan pipeline CI/CD: format, unit test, build artifact, empat smoke browser, staging setelah CI main, dan production manual melalui GitHub Environment. Konfigurasi dan batas rollback dicatat di `CI_CD.md`; deployment nyata belum diverifikasi.
- [ ] Tentukan subdomain `muidsoft.com`, konfigurasi DNS/TLS, serta uji prosedur backup/rollback produksi.
- [ ] Aktifkan live setelah P0–P4 dan hasil acceptance memenuhi kriteria; catat hasil, batas provider, dan aturan operasional dalam dokumentasi rilis.

**Selesai jika:** URL produksi, konfigurasi, monitoring, backup/rollback, dan hasil acceptance tersedia. Push kode ke GitHub tidak otomatis berarti aplikasi sudah dideploy.

## Urutan kerja berikutnya

1. Keputusan 20.11–20.12 sudah diterapkan. Berikutnya: bobot/fitur scanner lanjutan, verifikasi CFTC, kuota AI, visual dan i18n yang belum lengkap; pekerjaan tanpa credential dapat tetap berjalan.
2. Validasi data dan histori P1, lalu alur keputusan/status P2 menggunakan aturan yang sudah dikunci.
3. Selesaikan pengalaman pengguna P3; lakukan pengukuran/review P4 sebelum rilis.
4. Deploy dan lakukan acceptance P5 setelah akses serta konfigurasi siap.

Tidak ada estimasi tanggal rilis sampai akses provider, aturan terbuka, serta hasil pengukuran tersedia. Tandai checklist selesai hanya dengan bukti implementasi dan validasi; perbarui `IMPLEMENTATION.md` pada setiap milestone.

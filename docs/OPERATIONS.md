# Pemeriksaan kesehatan dan penerimaan produksi

Keberhasilan pemeriksaan lokal bukan bukti penerimaan produksi: akses provider nyata, aturan sinyal yang masih terbuka, pemulihan, dan pengukuran perangkat tetap mengikuti `PROJECT_PLAN.md`.

## Health dan readiness

`GET /api/health` tersedia tanpa login. HTTP 200 membutuhkan koneksi D1 dengan tabel/kolom inti dari empat migrasi. Pada mode live, password admin, format master key AES 64 digit hex, dan binding MarketHub juga harus tersedia. Kegagalan menghasilkan HTTP 503, `status=degraded`, serta boolean `checks.database`/`checks.configuration`; pesan SQL dan nilai secret tidak dikirim. Probe D1 dibatasi tiga detik dan tidak memindai isi tabel atau menulis data. Ini tidak membuktikan ciphertext lama cocok dengan master key saat ini.

`GET /api/readiness` membutuhkan cookie sesi privat yang masih valid. Login lewat aplikasi lalu buka URL ini pada browser yang sama. Endpoint memeriksa health dan status kedua aset dari MarketHub; permintaan hub dibatasi tiga detik. Respons tidak menyertakan harga, API key, atau output AI. Pemeriksaan membaca state yang sudah ada, tanpa memulai scanner, memanggil provider/AI, atau mengirim Discord.

Pada mode live, HTTP 200 membutuhkan kedua aset berstatus `fresh`, atau emas berstatus `closed` yang baru dikonfirmasi provider. Timestamp harga yang diperdagangkan dan waktu observasi lokal maksimal berumur 45 detik. Harga harus valid, dan timestamp provider tidak boleh lebih dari lima detik di masa depan. Harga penutupan emas boleh berasal dari waktu pasar terakhir buka, tetapi observasi provider tetap harus baru. Snapshot D1 setelah restart tidak dianggap observasi baru; readiness tetap 503 sampai feed/poll kembali tersedia. Data stale/missing atau hub gagal menghasilkan 503. Pada demo, data pasar tidak diwajibkan (`market=not_required`).

Gunakan `/api/health` untuk memantau database/konfigurasi. Pantau `/api/readiness` dengan sesi privat yang dikelola aman untuk mengetahui kesegaran data; sesi tetap kedaluwarsa sesuai aturan login. Jangan mempublikasikan cookie atau memakai health saja untuk menyatakan sistem trading siap. Uji empat slot AI, histori/candle, failover, dan Discord tetap terpisah.

Workers Logs diaktifkan pada konfigurasi repository dan dipertahankan generator deployment. Akses log mengikuti hak akun Cloudflare. Jangan menambahkan password, token sesi, API key, atau URL webhook ke log. Konfigurasi log ini belum membuktikan monitor/alert eksternal sudah dipasang.

## Batas keandalan AI dan alert

Workers AI diberi deadline 12 detik per percobaan, maksimal dua percobaan. Timeout mengirim sinyal abort; aplikasi tetap melanjutkan retry/abstain bila binding mengabaikannya. Hasil terlambat tidak mengganti suara yang sudah selesai. Adapter HTTP memakai timeout 12 detik yang sudah tersedia. Timeout aplikasi tidak menjamin pembatalan komputasi atau tagihan provider yang sudah menerima permintaan.

Untuk alert harga dengan Discord aktif, perubahan status one-shot dan insert outbox berada dalam satu transaksi D1. Kegagalan salah satu operasi menggagalkan keduanya. Kondisi level/hapus/nonaktif diperiksa lagi di transaksi sehingga tick yang membaca level lama tidak menciptakan notifikasi. Jika Discord nonaktif, alert tetap ditandai terpicu tanpa outbox.

ID outbox mencegah duplikasi pencatatan alert yang sama; pengiriman Discord tetap dapat berulang bila Discord sudah menerima pesan tetapi respons atau pencatatan `sent` gagal. Jangan menganggap pengiriman HTTP sebagai exactly-once. Outbox gagal setelah batas retry memerlukan pemeriksaan operator melalui audit privat. Pengiriman channel nyata dan SLA belum dibuktikan. Transaksi alert ini tidak memperbaiki seluruh alur sinyal yang terputus saat restart.

## Urutan penerimaan rilis

1. Kunci keputusan invalidasi/pembatalan sinyal, konflik timeframe, serta definisi scanner yang masih terbuka. Catat aturan dan fixture regresinya.
2. Catat Worker, database, commit, versi deployment sebelumnya, serta migrasi yang akan diterapkan. Pastikan target dan secrets benar. Jangan mengganti master key tanpa migrasi ciphertext.
3. Buat backup D1 dan buktikan restore pada database terpisah sebelum perubahan skema. Verifikasi data, sesi, pengaturan, dan dekripsi credential melalui akses privat. Catat waktu pemulihan dan batas kehilangan data; langkah ini belum dilakukan oleh tes lokal.
4. Setelah deployment yang disetujui, pastikan health lulus. Sesudah cron/feed mulai berjalan, periksa readiness, login/logout dan penolakan akses publik. Jangan menutupi kegagalan readiness dengan data demo.
5. Dengan akun provider dan channel uji milik pemilik, uji BTC/emas, empat slot AI, timeout/abstain, histori/gap recovery, entry/TP/SL/expiry, alert, pemutusan koneksi, dan restart. Catat kuota, biaya, serta lisensi data.
6. Ukur latensi, failover, uptime dan performa HP nyata sesuai target PRD. Siapkan penanggung jawab dan alert untuk stale data, error, kuota, serta outbox tertunda.
7. Latih rollback Worker dan pemulihan D1 secara terpisah. Rollback kode tidak membatalkan migrasi database. Pastikan kode lama kompatibel dengan skema, atau gunakan pemulihan data yang sudah diuji. Simpan hasil penerimaan dan batas yang tersisa sebelum menyatakan rilis produksi.

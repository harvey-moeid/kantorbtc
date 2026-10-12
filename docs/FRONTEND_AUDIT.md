# Frontend audit dan pembaruan mobile first

Audit: 12 Oktober 2026. Implementasi diperiksa pada Chromium lokal dengan data demo dan fixture API privat. Pengujian tidak memanggil provider atau mengirim alert nyata.

## Temuan dan perbaikan

| Temuan                                                          | Dampak                                       | Perubahan                                                                                         |
| --------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Teks ponsel 7–10 px pada tabel, panel scanner dan pengaturan    | Informasi pasar sulit dipindai               | Teks isi utama 12–14 px, harga lebih dominan, jarak dan hierarki diperjelas                       |
| Tombol ikon dan kontrol ponsel terlalu kecil                    | Sentuhan rawan meleset                       | Ikon/tombol utama minimal 44 px; switch native memakai area 52 × 44 px                            |
| Navigasi utama hanya melalui drawer                             | Halaman penting memerlukan beberapa sentuhan | Dock lima tujuan: kantor, chart, sinyal, meeting dan pengaturan; akses privat tetap meminta login |
| Panel scanner dan analis dipadatkan menjadi dua kolom           | Label kecil dan sulit dibaca                 | Scanner satu kolom; analis menjadi daftar dua baris yang dapat digeser horizontal                 |
| Tabel sinyal diperkecil di ponsel                               | Entry, SL dan status bersaing untuk ruang    | Baris kartu pada ponsel; tabel tetap pada tablet/desktop, dengan role table/row/cell eksplisit    |
| Statistik sinyal disembunyikan pada ponsel                      | Ringkasan aktivitas hilang                   | Kartu statistik tetap ditampilkan di bawah harga                                                  |
| Header publik terlalu lebar setelah kontrol diperbesar          | Viewport melebar dan dock sulit diklik       | Status ringkas; lebar dokumen dibandingkan langsung dengan viewport perangkat                     |
| Drawer belum memiliki pengelolaan fokus lengkap                 | Keyboard dapat berpindah ke konten belakang  | Fokus dibatasi di drawer, Escape menutup, fokus kembali ke tombol, konten belakang inert          |
| Dialog tidak mempunyai nama programatik yang terhubung ke judul | Konteks pembaca layar kurang jelas           | `aria-labelledby`, scroll halaman dikunci, header dialog tetap terlihat                           |
| Gaya panel dan chart berbeda                                    | Pengalaman visual tidak konsisten            | Palet graphite/mint, permukaan bertingkat, radius/spacing seragam dan tema canvas chart baru      |

## Implementasi

`apps/web/src/premium.css` menjadi lapisan presentasi mobile first yang dimuat setelah CSS komponen lama. Layout awal adalah ponsel; enhancement pada 761 px mengaktifkan sidebar/tabel, dan 1180 px mengaktifkan komposisi desktop penuh. Navigasi bawah mempunyai safe-area inset; toast ditempatkan di atasnya. Form menggunakan teks 16 px untuk input/select pada ponsel, dan tidak menghapus informasi harga/risiko agar terlihat lebih bersih. `viewport-fit=cover`, `svh/dvh`, reduced motion, skip link dan perpindahan route kembali ke atas disertakan.

Warna utama diperiksa secara matematis: teks utama 15.56:1, teks muted 7.77:1, tombol utama 12.23:1, dan navigasi ponsel 8.33:1. Angka ini hanya memeriksa pasangan token tersebut, bukan klaim audit WCAG menyeluruh.

## Verifikasi

- 308 tes otomatis lulus; enam tes jaringan BTC opsional dilewati.
- Kelima smoke browser lulus tanpa error JavaScript: smoke aplikasi, meeting/replay, alert, lifecycle/COT, serta mobile design.
- Smoke desain menguji gate halaman privat, kantor/sinyal pada 320/360/390/430 px, navigasi 44 px, drawer keyboard/Escape/fokus, modal bernama dan scroll lock, enam tab pengaturan, meeting/chart ponsel, tablet 768 px dan desktop 1440 px. Tidak ada overflow dokumen pada viewport yang diuji.
- Build TypeScript/Vite produksi lulus; bundle Three.js masih menghasilkan peringatan chunk lebih besar dari 500 kB yang sudah ada sebelum pembaruan ini.
- Screenshot hasil berada pada `test-results/premium-*.png`; screenshot ponsel memakai viewport agar posisi dock mencerminkan layar sebenarnya.

Pengujian ini memakai Chromium, bukan perangkat fisik atau Safari. Pengukuran performa perangkat fisik, audit WCAG menyeluruh, dan penyelesaian seluruh teks ID/EN tetap merupakan pekerjaan terpisah.

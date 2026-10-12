# Review kantor 3D dan pembaruan visual

Audit: 12 Oktober 2026. Scene procedural Three.js/R3F, dua lantai dan 13 karakter. Pemeriksaan memakai Chromium lokal dan software renderer, tanpa mengakses provider atau mengirim notifikasi nyata.

## Temuan dan perbaikan

| Temuan                                                                                                                  | Perubahan                                                                                                                                                                                    |
| ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Permukaan besar dan pencahayaan membuat ruang terlihat datar                                                            | Timber floor, panel akustik, trim graphite, ceramic planter, meja dengan tepi membulat, kursi berlapis dan lampu linear hangat. Tone mapping ACES dengan pencahayaan key/fill lebih seimbang |
| Meja/kursi tersusun dari banyak mesh terpisah                                                                           | Hardware, aksesori, kursi meeting, papan lantai, panel dinding, daun dan detail karakter dibatch memakai InstancedMesh                                                                       |
| Setiap monitor membuat texture baru ketika quote berubah                                                                | Dua texture layar dipakai bersama seluruh monitor; canvas/map dipertahankan dan diperbarui tanpa alokasi texture setiap tick. Texture dibuang saat scene dilepas                             |
| Mode Low menghilangkan IT dan resepsionis                                                                               | Ketiga profil selalu membuat 13 karakter; Low mengurangi segmen mesh, daun, dan bevel furniture                                                                                              |
| Kamera memakai posisi dan pengali zoom tetap                                                                            | Framing dihitung dari bounding volume ruangan, floor, aspect ratio, dan frustum. Uji memproyeksikan sudut melalui PerspectiveCamera Three.js nyata dengan margin 16%                         |
| Camera follow membuat Vector3 baru setiap frame                                                                         | Offset dipakai ulang; interpolasi eksponensial dan orbit damping memberi gerak lebih halus                                                                                                   |
| ContactShadows merender scene serta blur tambahan setiap frame dan mempertahankan target texture setelah profil berubah | Dihapus; contact grounding ringan dipakai bersama semua profil, ditambah soft directional shadow 1024 px hanya pada High. Shadow map dilepas saat profil turun                               |
| Scene tetap berjalan ketika kantor keluar viewport                                                                      | IntersectionObserver menjeda frameloop di luar viewport; pause document/reduced motion tetap berlaku                                                                                         |
| Event context-loss terpasang tanpa cleanup                                                                              | Listener kini dilepas sebelum canvas dibuang. Remount publik/privat tidak lagi memicu fallback 2D palsu                                                                                      |
| Konten layar privat dapat bertahan sebagai pixel lama saat viewer berubah                                               | Canvas publik/privat dipisahkan lewat remount, texture baru dibuat untuk viewer baru, dan konten publik tetap tanpa harga/level privat                                                       |
| Layar War Room bertabrakan dengan panel baru                                                                            | Monitor dipindahkan di depan permukaan panel                                                                                                                                                 |
| Layar penuh tidak menangani keyboard/body scroll lengkap                                                                | Focus trap, Escape, pengembalian fokus, scroll lock dan nama dialog. Modal staf tetap dapat dibuka di dalam fullscreen                                                                       |

## Biaya render yang diamati

Pengukuran berikut adalah satu sampel scene semua lantai dengan profil manual, bukan benchmark FPS atau SLA perangkat fisik. `drawCalls` berasal dari main render pass terakhir; tidak mengukur seluruh biaya shadow pass/GPU.

| Sampel          | Main draw calls | Segitiga main pass | Texture GPU |
| --------------- | --------------: | -----------------: | ----------: |
| Sebelum, Medium |             399 |             17.972 |          21 |
| Sesudah, Low    |             306 |             16.472 |           9 |
| Sesudah, Medium |             306 |             28.212 |           9 |
| Sesudah, High   |             306 |             29.812 |          11 |

Medium memakai sekitar 23% lebih sedikit draw call dan 57% lebih sedikit texture dari baseline. Detail visual menambah segitiga pada Medium/High. Low tetap membawa 13 karakter dengan geometri lebih kecil. Texture kembali ke 9 setelah turun dari High; pergantian floor tidak mengalokasikan ulang texture layar. FPS software pada sampel tidak dipakai untuk menyimpulkan peningkatan kecepatan, karena dipengaruhi shader warmup, browser, ukuran canvas, dan beban CPU.

## Verifikasi

- 318 tes otomatis lulus, termasuk 10 kasus proyeksi kamera/aspect/floor dan input viewport invalid; enam tes jaringan BTC opsional dilewati.
- Smoke scene memeriksa 13 karakter pada Low/Medium/High, render setelah login/logout, reuse texture, reset kamera, offscreen pause/resume, scene 390 px, fullscreen/Escape/fokus/scroll lock, gate publik, serta reduced-motion on-demand.
- Screenshot tersedia di `test-results/scene-*.png` dan baseline metrik di log lokal ignored `work/scene-before.log`.
- Keenam smoke browser lulus tanpa error JavaScript: aplikasi, meeting/replay, alert, lifecycle/COT, mobile design dan scene.
- Build TypeScript/Vite dan pemeriksaan formatting lulus.

Karakter tetap berupa figurine procedural, belum aset GLB rigged. Tidak ada asset eksternal, HDRI berlisensi, atau postprocessing berat yang ditambahkan. Review ini belum mencakup benchmark HP fisik/Safari, profil GPU lengkap, atau kualitas visual pada semua driver WebGL.

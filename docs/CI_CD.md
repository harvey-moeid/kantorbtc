# CI/CD GitHub Actions dan Cloudflare

Workflow [Kantor CI/CD](../.github/workflows/ci.yml) berjalan pada push, pull request, dan pemicu manual. Aksi pihak ketiga dipin ke SHA; pnpm mengikuti `packageManager`, Node memakai versi 24, Python 3.12, dan Playwright mengikuti `tests/requirements.txt`.

## CI

1. Job **Format, tests and build** memasang dependency dengan frozen lockfile, memeriksa format, menjalankan Vitest, membangun frontend beserta typecheck, dan memeriksa packaging Worker lewat Wrangler dry run tanpa account/token. Build disimpan sebagai artifact `frontend-<commit SHA>` selama tujuh hari.
2. Job **Desktop and mobile smoke tests** memakai artifact yang sama, memasang Chromium Playwright, menerapkan seluruh migrasi D1 (saat ini sembilan) pada database sementara, dan menjalankan keenam smoke test. Runner `scripts/ci-browser.sh` menunggu respons health demo dan menghentikan proses miliknya setelah selesai/gagal. Screenshot dan log server di `test-results/` diunggah juga saat test gagal.
3. Job **Deploy Cloudflare** hanya berjalan setelah dua job tersebut berhasil, pada ref `main`, dan jika repository variable `CLOUDFLARE_DEPLOY_ENABLED=true`. Pull request dan branch fitur tidak menjalankan deployment.

Tambahkan kedua job CI sebagai required status checks pada aturan branch `main` di GitHub setelah workflow tersedia. Deploy dari push `main` memilih staging; pemicu manual dapat memilih staging atau production. Pilih ref `main` ketika menjalankan pemicu manual. Pemicu manual baru tersedia setelah workflow digabung ke default branch.

## Konfigurasi deployment

Buat dua GitHub Environments: `staging` dan `production`. Batasi deployment ke branch `main`. Untuk `production`, atur required reviewers agar penerapan produksi memerlukan persetujuan pemilik. Isi nilai pada masing-masing environment, bukan di file repository atau chat.

| Jenis    | Nama                          | Isi                                                                                                                                                                   |
| -------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Secret   | `CLOUDFLARE_API_TOKEN`        | Token Cloudflare untuk account target, dengan Workers Scripts: Edit dan D1: Edit. Jika account mensyaratkan izin lain, sesuaikan dengan konfigurasi account tersebut. |
| Variable | `CLOUDFLARE_ACCOUNT_ID`       | ID account Cloudflare, 32 digit hex.                                                                                                                                  |
| Variable | `CLOUDFLARE_D1_DATABASE_ID`   | UUID D1 yang sudah dibuat untuk environment ini. Wajib berbeda antara staging dan production.                                                                         |
| Variable | `CLOUDFLARE_D1_DATABASE_NAME` | Opsional: nama D1. Default `kantor-db-staging` / `kantor-db`.                                                                                                         |
| Variable | `CLOUDFLARE_WORKER_NAME`      | Opsional: nama Worker. Default `kantor-trading-staging` / `kantor-trading`. Gunakan nama berbeda untuk setiap environment.                                            |
| Variable | `CLOUDFLARE_HEALTH_URL`       | URL HTTPS Worker atau domain yang sudah terkonfigurasi, dengan path `/api/health`, tanpa credential/query.                                                            |

Siapkan kedua database D1 melalui dashboard Cloudflare atau CLI pemilik sebelum mengaktifkan CD; workflow tidak membuat database atau DNS. Aktifkan repository variable `CLOUDFLARE_DEPLOY_ENABLED=true` setelah konfigurasi staging siap. Tanpa flag ini, CI tetap berjalan dan deployment dilewati. Environment yang dipilih tetapi belum memiliki konfigurasi lengkap akan gagal pada preflight sebelum migrasi remote.

Generator `scripts/configure-deploy.mts` membaca `wrangler.jsonc` dengan parser Wrangler lalu menulis konfigurasi ke path ignored `.wrangler/ci-deploy/wrangler.json`. Path source, assets, dan migrasi dibuat absolut. Source `wrangler.jsonc` dan ID database lokal tidak diubah. Generator tidak menyimpan token/account credential dalam file. D1, Durable Object dan migrasi class dipertahankan; binding Workers AI disertakan jika sudah dikonfigurasi di source. Kedua target tetap `APP_MODE=demo`; cron staging dikosongkan. Integrasi live memerlukan pekerjaan konfigurasi dan validasi terpisah sesuai PRD.

Deployment menerapkan migrasi D1 remote, kemudian mengunggah Worker dengan artifact frontend hasil CI pada commit yang sama. Job per environment diserialkan; deployment yang sedang berjalan tidak dibatalkan oleh push baru. Langkah terakhir memeriksa respons `/api/health` dengan `status=ok`, `app=kantor`, dan `mode=demo`. Health check membuktikan aplikasi terjangkau, bukan integrasi provider live atau seluruh operasi D1. Secret aplikasi seperti `ADMIN_PASSWORD_HASH` dan `ENCRYPTION_KEY` tetap dikelola sebagai Worker secrets secara terpisah; workflow ini tidak mengganti nilainya.

## Pemeriksaan lokal

Dengan dependency Node, Python Playwright, dan Chromium terpasang:

```sh
pnpm install --frozen-lockfile
pnpm format:check
pnpm test
pnpm build
bash scripts/ci-browser.sh
```

Hentikan server lokal pada port 5173 dan 8787 sebelum menjalankan runner CI. Runner menolak port terpakai agar tidak menguji server lain; database sementara dihapus saat selesai. `CHROMIUM_PATH` dapat menunjuk Chromium sistem, atau path dari Playwright. Cloud sandbox dengan home read-only tetap menggunakan ekspor XDG/`WRANGLER_LOG_PATH` di README.

Untuk memeriksa packaging tanpa account/token atau deployment nyata, setelah build:

```sh
DEPLOY_ENVIRONMENT=staging \
CLOUDFLARE_D1_DATABASE_ID=11111111-2222-4333-8444-555555555555 \
node scripts/configure-deploy.mts --dry-run
pnpm exec wrangler deploy --dry-run \
  --config .wrangler/ci-deploy/wrangler.json \
  --outdir .wrangler/ci-deploy/bundle
```

UUID di contoh hanya fixture untuk dry run. Gunakan ID nyata untuk deployment. `--dry-run` generator hanya melewati pemeriksaan credential; target dan format D1 tetap divalidasi. Jangan menjalankan migrasi remote terhadap fixture tersebut.

## Pemulihan

Simpan backup D1 sebelum perubahan skema produksi. Jika health check atau acceptance gagal setelah deployment, job berstatus gagal meskipun Worker sudah terunggah; periksa deployment Cloudflare dan log job. Pemicu manual workflow pada `main` dapat mengulang deployment setelah konfigurasi diperbaiki. Untuk mengembalikan Worker ke versi sebelumnya, gunakan dashboard Cloudflare atau `wrangler rollback` dengan konfigurasi target yang sesuai. Rollback Worker tidak membatalkan migrasi D1; perubahan skema yang tidak kompatibel memerlukan prosedur restore/migrasi tersendiri. Smoke ini tidak membuktikan backup/restore produksi.

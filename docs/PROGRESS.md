# TasteQuest v3 — Checklist Progres

Dokumen kerja agar pembangunan bisa dilanjutkan bila sesi terputus. Centang hanya setelah diverifikasi.

## Keputusan dasar
- Satu `package.json` (tanpa workspaces): `shared/` (scoring, touch, FSM, schema Zod), `server/` (Express 5 + `node:sqlite` + Socket.IO, dijalankan langsung oleh Node 24 tanpa build), `web/` (React 19 + Vite 8 + Tailwind 4 + Recharts 3), `firmware/` (PlatformIO `nodemcuv2`).
- Folder lama `../TasteQuest` tidak diubah. DB lama tidak berisi game/rating, jadi tidak ada migrasi data.
- Leaderboard: skor tertinggi → total waktu lock tercepat → waktu selesai paling awal → id.
- Jarak dikuantisasi 0,1 cm agar skor identik di firmware (C++) dan server/simulator (TS).

## Tahapan
- [x] 1. Scaffold workspace, `.gitignore`, `.env.example`, script setup
- [x] 2. `shared/`: scoring, touch classifier, FSM, schema + unit test
- [x] 3. `server/`: DB + migrasi, auth, endpoints, Socket.IO + integration test
- [x] 4. `web/`: shell, design tokens, semua halaman, simulator Demo
- [x] 5. `firmware/`: config.h, logika host-testable, main.cpp, build `nodemcuv2`
- [x] 6. Lint, typecheck, build produksi
- [x] 7. Browser smoke test (Playwright) + offline readiness
- [x] 8. Dokumentasi: README, BRAND, WIRING, SETUP, PRESENTASI, ANALYSIS, TEST_REPORT
- [x] 9. Review akhir & handoff (verifikasi segar: check, firmware clean build, e2e online + offline)
- [x] 11. v3.0.1: perbaiki payload firmware (HTTP 422), test kontrak firmware↔server, animasi OLED IDLE, slide kiosk, teks dashboard tanpa tanda pisah
- [x] 12. v3.1.0: ProxiRush 5 ronde (maks 500, migrasi DB v2), latihan 3/5/8/10 sebelum main, kunci otomatis saat waktu habis, zona 100 (target s.d. +0,9 cm), melodi akhir sesuai skor
- [x] 13. v3.1.1: Main ProxiRush langsung 5 ronde dinilai (latihan sebelum main dihapus, menu Latihan tetap), skor akhir OLED hanya 3 skor ronde pertama
- [ ] 10. Checklist hardware fisik (docs/WIRING.md §7) — menunggu board & persetujuan upload

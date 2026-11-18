import { expect, test, type Page } from '@playwright/test';

const SHOT = 'test-results/screens';

async function tap(page: Page) {
  await page.getByRole('button', { name: 'Sentuh singkat' }).click();
  await page.waitForTimeout(250);
}
async function hold(page: Page) {
  await page.getByRole('button', { name: 'Tahan 1,4 dtk' }).click();
  await page.waitForTimeout(1650);
}
async function setDistance(page: Page, cm: number) {
  await page.locator('#sim-distance').evaluate((el, v) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(el, String(v));
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, cm);
}
const noHorizontalScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test('alur lengkap Demo Mode: Main ProxiRush, 5 ronde, leaderboard, rating, skip, offline, kiosk', async ({ page }) => {
  test.setTimeout(240_000);
  page.on('dialog', (d) => d.accept());
  const consoleErrors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
  const external: string[] = []; // kesiapan offline: semua aset harus lokal
  page.on('request', (r) => !/^(https?|wss?):\/\/127\.0\.0\.1[:/]|^data:|^blob:/.test(r.url()) && external.push(r.url()));

  await test.step('empty state & login operator', async () => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
    await expect(page.getByText('Belum ada aktivitas')).toBeVisible();
    await page.screenshot({ path: `${SHOT}/01-overview-empty.png`, fullPage: true });
    await page.goto('/#/arena');
    await expect(page.getByRole('link', { name: 'Login operator' })).toBeVisible();
    await page.goto('/#/settings');
    await page.getByLabel('Password operator').fill('salah-sekali');
    await page.getByRole('button', { name: 'Masuk' }).click();
    await expect(page.getByRole('alert')).toContainText('Password operator salah');
    await page.getByLabel('Password operator').fill('e2e-operator-pass');
    await page.getByRole('button', { name: 'Masuk' }).click();
    await expect(page.getByRole('heading', { name: 'Mode data' })).toBeVisible();
  });

  const oled = page.getByTestId('oled');
  const stage = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Panggung permainan' }) });

  const targetOf = async () => Number(/target (\d+) cm/i.exec((await oled.textContent()) ?? '')![1]);

  await test.step('Main ProxiRush langsung ke ronde asli, tanpa latihan', async () => {
    await page.goto('/#/arena');
    await page.getByRole('button', { name: 'Nyalakan' }).click();
    await expect(oled).toContainText('TASTEQUEST');
    await expect(stage).toContainText('SIAP DICOBA!');
    await tap(page);
    await expect(oled).toContainText('MENU');
    await hold(page);
    await expect(oled).toContainText('PROXIRUSH');
    await expect(oled).not.toContainText('Berapa ronde latihan?');
    await hold(page);
  });

  await test.step('lima ronde: tepat, meleset 0,5 cm, kunci otomatis, tanpa bacaan, zona 100', async () => {
    const plan: (number | 'auto' | 'fault')[] = [0, -0.5, 'auto', 'fault', 0.9];
    const want = [100, 95, 100, 0, 100];
    for (let i = 0; i < 5; i++) {
      await expect(oled).toContainText(`RONDE ${i + 1}/5`, { timeout: 8000 });
      const target = await targetOf();
      const dev = plan[i];
      if (dev === 'fault') {
        await page.getByLabel(/Sensor error/).check();
        await expect(oled).toContainText('WAKTU HABIS', { timeout: 16000 });
        await page.getByLabel(/Sensor error/).uncheck();
      } else if (dev === 'auto') {
        await setDistance(page, target + 0.5); // tidak menyentuh pad: terkunci saat waktu habis
        await expect(oled).toContainText(`Kunci ${(target + 0.5).toFixed(1)} cm`, { timeout: 16000 });
      } else {
        await setDistance(page, target + dev);
        await expect(oled).toContainText('SENTUH=KUNCI, ATAU TUNGGU', { timeout: 6000 });
        if (i === 0) {
          await expect(stage).toContainText('Jarak dirahasiakan'); // mode kompetisi tidak membocorkan jarak
          await page.screenshot({ path: `${SHOT}/02-arena-round.png`, fullPage: true });
        }
        await tap(page);
      }
      await expect(oled).toContainText(`+${want[i]} poin`);
    }
    await expect(oled).toContainText('SKOR AKHIR PRO', { timeout: 8000 });
    await expect(oled).toContainText('395 / 500');
    await expect(stage).toContainText('SKOR TERTINGGI BARU!', { timeout: 5000 });
    await page.screenshot({ path: `${SHOT}/03-arena-result.png`, fullPage: true });
  });

  await test.step('skip rating setelah game, lalu rating langsung dari menu', async () => {
    await tap(page);
    await expect(oled).toContainText('Beri rating karya?');
    await tap(page);
    await expect(oled).toContainText('Sampai jumpa!');
    await expect(oled).toContainText('TASTEQUEST', { timeout: 6000 });
    await tap(page);
    await tap(page);
    await tap(page);
    await expect(oled).toContainText('> Beri Rating');
    await hold(page);
    await expect(oled).toContainText('Nilai karya kami');
    await hold(page);
    await expect(oled).toContainText('Pilih bintang dulu');
    for (let i = 0; i < 4; i++) await tap(page);
    await expect(oled).toContainText('(4)');
    await hold(page);
    await expect(oled).toContainText('Terkirim ke server');
    await expect(stage).toContainText('Rating diterima server');
  });

  await test.step('putus Wi-Fi: rating tertahan di antrean lalu terkirim dengan ID sama', async () => {
    await expect(oled).toContainText('TASTEQUEST', { timeout: 6000 });
    await page.getByLabel(/Putuskan Wi-Fi/).check();
    await tap(page);
    await tap(page);
    await tap(page);
    await hold(page);
    for (let i = 0; i < 5; i++) await tap(page);
    await hold(page);
    await expect(oled).toContainText('Tersimpan, antre');
    const first = page.locator('ul li').filter({ hasText: 'Rating:' }).first();
    await expect(first).toContainText('menunggu');
    await page.getByLabel(/Putuskan Wi-Fi/).uncheck();
    await expect(first).toContainText('diterima server', { timeout: 5000 });
  });

  await test.step('leaderboard, reviews, overview, device monitor memakai data backend', async () => {
    await page.goto('/#/leaderboard');
    await expect(page.locator('tbody tr')).toHaveCount(1);
    await expect(page.locator('tbody tr').first()).toContainText('395');
    await expect(page.locator('tbody tr').first()).toContainText('habis');
    await page.screenshot({ path: `${SHOT}/04-leaderboard.png`, fullPage: true });

    await page.goto('/#/reviews');
    await expect(page.getByText('dari 2 rating masuk')).toBeVisible();
    await expect(page.getByText('4,5').first()).toBeVisible();
    await page.screenshot({ path: `${SHOT}/05-reviews.png`, fullPage: true });

    await page.goto('/');
    await expect(page.locator('div.px-frame').filter({ hasText: /^Sesi game1Dihitung per permainan/ })).toBeVisible();
    await expect(page.getByText('Pemain #1').first()).toBeVisible();
    await page.screenshot({ path: `${SHOT}/06-overview-data.png`, fullPage: true });

    await page.goto('/#/device');
    await expect(page.getByRole('heading', { name: 'SIM-01' })).toBeVisible();
    await expect(page.getByText('ONLINE').first()).toBeVisible();
    await expect(page.locator('[aria-current="step"]')).toHaveCount(1);
    await page.screenshot({ path: `${SHOT}/07-device.png`, fullPage: true });
  });

  await test.step('pengaturan, ekspor CSV, mode LIVE', async () => {
    await page.goto('/#/settings');
    await page.getByLabel('Batas waktu ronde').fill('8');
    await page.getByRole('button', { name: 'Simpan pengaturan' }).click();
    await expect(page.getByText('Tersimpan.')).toBeVisible();
    const csv = await page.request.get('/api/export/games.csv?mode=demo');
    expect(csv.status()).toBe(200);
    expect(await csv.text()).toContain(',395,');
    await page.screenshot({ path: `${SHOT}/08-settings.png`, fullPage: true });

    await page.getByRole('button', { name: /^LIVE/ }).click();
    await expect(page.locator('[title="Data dari ESP8266 fisik"]:visible').first()).toBeVisible();
    await page.goto('/#/arena');
    await expect(page.getByRole('heading', { name: 'Mode LIVE' })).toBeVisible();
    await expect(stage).toContainText('PERANGKAT OFFLINE');
    await page.goto('/#/leaderboard');
    await expect(page.getByText('Belum ada skor')).toBeVisible(); // leaderboard live terpisah dari demo
    await page.goto('/#/settings');
    await page.getByRole('button', { name: /^DEMO/ }).click();
    await expect(page.getByRole('heading', { name: 'Mode data' })).toBeVisible();
  });

  await test.step('kiosk 1920×1080: podium, kredit, logo', async () => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/#/kiosk');
    await expect(page.getByText('© Muhammad Aziz Syah Dani 2026')).toBeVisible();
    await expect(page.getByText('HMIF UNJA × FST MARKET DAY 2026')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Top 3 ProxiRush' })).toBeVisible();
    const logoOk = await page.getByAltText('Logo HMIF Universitas Jambi').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0);
    expect(logoOk).toBe(true);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SHOT}/09-kiosk-1080p.png` });
    expect(await noHorizontalScroll(page)).toBe(true);
  });

  await test.step('mobile 390px: tanpa scroll horizontal', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const p of ['/', '/#/leaderboard', '/#/reviews', '/#/arena', '/#/device', '/#/settings']) {
      await page.goto(p);
      await page.waitForTimeout(300);
      expect(await noHorizontalScroll(page), `scroll horizontal di ${p}`).toBe(true);
    }
    await page.goto('/');
    await page.screenshot({ path: `${SHOT}/10-mobile-overview.png`, fullPage: true });
    await page.goto('/#/arena');
    await page.screenshot({ path: `${SHOT}/11-mobile-arena.png`, fullPage: true });
  });

  await test.step('loading & error state saat server lambat / tidak terjangkau', async () => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.route('**/api/overview', async (r) => { await new Promise((ok) => setTimeout(ok, 1500)); await r.continue(); });
    await page.goto('/');
    await expect(page.getByRole('status').filter({ hasText: 'Memuat data' })).toBeVisible();
    await expect(page.getByText('Rating masuk')).toBeVisible({ timeout: 5000 });
    await page.unroute('**/api/overview');
    await page.route('**/api/overview', (r) => r.abort());
    await page.goto('/');
    await expect(page.getByRole('alert')).toContainText('Server tidak dapat dihubungi');
    await page.unroute('**/api/overview');
  });

  await test.step('reset data demo dengan konfirmasi', async () => {
    await page.goto('/#/settings');
    const btn = page.getByRole('button', { name: 'Hapus data demo' });
    await expect(btn).toBeDisabled();
    await page.getByLabel(/untuk konfirmasi/).fill('RESET');
    await btn.click();
    await expect(page.getByText(/Data demo dihapus: 1 sesi, 2 rating/)).toBeVisible();
  });

  expect(consoleErrors.filter((e) => !/ERR_FAILED|Failed to load resource/.test(e))).toEqual([]);
  expect(external, 'request ke luar jaringan lokal').toEqual([]);
});

# Product Requirements Document (PRD)
# Crypto Market Dashboard

**Version:** 1.2  
**Status:** Refined Development Ready Draft  
**Owner:** Haru  
**Prepared by:** Nero  
**Product Type:** Web-based crypto market dashboard  
**Primary Platform:** Responsive web, desktop-first  
**Target Release:** TBD  
**Last Updated:** 2026-05-15

---

## 1. Document Purpose

Dokumen ini menjadi acuan produk dan teknis untuk pengembangan **Crypto Market Dashboard**. PRD ini mendefinisikan masalah, tujuan produk, ruang lingkup MVP, fitur, acceptance criteria, kebutuhan teknis, struktur halaman, prioritas pengembangan, risiko, dan pertanyaan terbuka.

PRD ini dirancang agar dapat langsung digunakan oleh tim product, UI/UX, frontend engineer, backend engineer, QA, dan stakeholder teknis.

---

## 2. Executive Summary

### 2.1 Background

Trader dan investor crypto membutuhkan dashboard yang cepat, informatif, dan real-time untuk memantau harga aset, melihat kondisi market, mengelola watchlist, melacak portfolio, membuat price alert, serta melakukan analisis teknikal dasar.

Banyak platform crypto terlalu kompleks untuk user pemula atau terlalu berat untuk kebutuhan monitoring harian. Produk ini akan fokus pada pengalaman yang ringkas, cepat, dark-first, dan praktis untuk pengambilan keputusan awal.

### 2.2 Problem Statement

User crypto sering harus membuka beberapa platform berbeda untuk melihat harga live, chart, portfolio, alert, sentimen market, dan indikator teknikal. Hal ini membuat proses monitoring lambat, terfragmentasi, dan kurang efisien.

### 2.3 Proposed Solution

Membangun web dashboard crypto real-time yang menyediakan:

- Live price crypto berbasis WebSocket.
- Market overview untuk aset utama.
- Watchlist pribadi.
- Search coin.
- Chart harga interaktif.
- Portfolio tracker.
- Price alert.
- Fear & Greed Index.
- Dark mode.
- Analisis teknikal dasar: MA, RSI, MACD, volume, support/resistance, trend label.

### 2.4 Product Vision

Menjadi dashboard crypto yang cepat, bersih, dan actionable untuk memantau market dan portfolio dalam satu tempat tanpa kompleksitas trading platform penuh.

---

## 3. Goals and Success Metrics

### 3.1 Product Goals

| Code | Goal | Description |
|---|---|---|
| G-01 | Real-time monitoring | User dapat melihat harga crypto live tanpa refresh halaman. |
| G-02 | Market clarity | User dapat memahami kondisi market melalui price, change, volume, market cap, dan sentiment index. |
| G-03 | Personalization | User dapat menyimpan watchlist, portfolio, theme, dan alert. |
| G-04 | Technical insight | User dapat melihat indikator teknikal dasar untuk mendukung analisis. |
| G-05 | Fast MVP delivery | Produk dapat dirilis sebagai frontend-first MVP sebelum backend penuh dibuat. |

### 3.2 Success Metrics

MVP dianggap berhasil jika memenuhi target berikut:

| Metric | Target |
|---|---:|
| Initial dashboard load | < 3 detik pada koneksi normal |
| Search response | < 500ms setelah input |
| WebSocket reconnect | Otomatis dalam maksimal 5 detik setelah disconnect |
| Default supported assets | Minimal 20 aset crypto utama |
| Chart timeframe | Minimal 1H, 24H, 7D, 30D |
| Watchlist persistence | Tetap tersedia setelah refresh browser |
| Portfolio calculation | Menampilkan total value dan P/L dengan benar |
| Alert creation | User dapat membuat, melihat, dan menghapus alert lokal |
| Accessibility | Kontras warna minimal WCAG AA untuk teks utama |

---

## 4. Target Users

### 4.1 Primary Persona — Retail Crypto Trader

**Profile:**

- Memantau harga crypto harian.
- Membutuhkan update harga real-time.
- Menggunakan chart dan indikator teknikal dasar.
- Sering memantau BTC, ETH, BNB, SOL, XRP, dan altcoin populer.

**Needs:**

- Harga cepat dan akurat.
- Chart mudah dibaca.
- Watchlist pribadi.
- Alert harga.
- Indikator teknikal dasar.

### 4.2 Secondary Persona — Long-term Crypto Investor

**Profile:**

- Tidak melakukan trading aktif setiap hari.
- Fokus pada nilai portfolio dan tren market.
- Membutuhkan ringkasan aset dalam satu dashboard.

**Needs:**

- Portfolio tracker.
- Market overview.
- Fear & Greed Index.
- Perubahan harga 24 jam, 7 hari, dan 30 hari.

---

## 5. Product Scope

### 5.1 MVP Scope

Fitur produk dibagi menjadi fase agar rilis pertama tetap tajam dan tidak melebar.

#### 5.1.1 MVP Core — First Usable Release

Fitur wajib untuk rilis pertama:

| Code | Feature | Priority | Phase |
|---|---|---|---|
| F-01 | Live price crypto | Must Have | MVP Core |
| F-02 | Market overview | Must Have | MVP Core |
| F-03 | Search coin | Must Have | MVP Core |
| F-04 | Watchlist | Must Have | MVP Core |
| F-05 | Coin detail page | Must Have | MVP Core |
| F-06 | Price chart, line chart first | Must Have | MVP Core |
| F-10 | Dark mode | Must Have | MVP Core |
| F-12 | Coin registry and symbol mapping | Must Have | MVP Core |
| F-13 | Market pulse / connection status | Must Have | MVP Core |

#### 5.1.2 MVP Plus — After Core Stability

Fitur yang masuk setelah MVP Core stabil:

| Code | Feature | Priority | Phase |
|---|---|---|---|
| F-07 | Portfolio tracker | Should Have | MVP Plus |
| F-08 | Price alert lokal | Should Have | MVP Plus |
| F-09 | Fear & Greed Index | Should Have | MVP Plus |

#### 5.1.3 V1.1 — Technical Analysis Release

Fitur analisis teknikal dipisah agar kualitas data, chart, dan perhitungan indikator tidak setengah matang.

| Code | Feature | Priority | Phase |
|---|---|---|---|
| F-11 | Technical analysis indicators | Should Have | V1.1 |
| F-14 | Clean Mode / Technical Mode on coin detail | Should Have | V1.1 |


### 5.2 Explicitly Out of Scope for MVP

Fitur berikut tidak termasuk MVP:

- News crypto.
- Trading langsung dari dashboard.
- Integrasi exchange account user.
- API key exchange milik user.
- Copy trading.
- AI trading signal.
- Backtesting strategi.
- Social/community feature.
- Mobile native app.
- Subscription/payment system.
- Backend authentication wajib.
- Alert yang tetap berjalan saat browser tertutup.

### 5.3 Future Scope

Fitur yang dapat dipertimbangkan setelah MVP:

- Login dan multi-device sync.
- Backend alert worker.
- Email/Telegram/push notification.
- Candlestick pattern detection.
- Advanced technical indicators.
- Server-side portfolio storage.
- User preferences cloud sync.
- Premium analytics.

---

## 6. User Journeys

### 6.1 Journey: Monitor Market

1. User membuka dashboard.
2. Dashboard menampilkan market overview dan top crypto.
3. Harga diperbarui secara real-time.
4. User melihat price change, volume, market cap, dan Fear & Greed Index.
5. User membuka coin detail untuk analisis lebih lanjut.

### 6.2 Journey: Manage Watchlist

1. User mencari coin melalui search.
2. User membuka hasil pencarian atau langsung menambahkan coin.
3. Coin masuk ke watchlist.
4. Watchlist tersimpan di browser.
5. User dapat menghapus coin dari watchlist kapan saja.

### 6.3 Journey: Analyze Coin

1. User membuka halaman detail coin.
2. User memilih timeframe chart.
3. User mengaktifkan indikator teknikal seperti MA, RSI, atau MACD.
4. Sistem menampilkan ringkasan tren sederhana.
5. User dapat membuat alert atau menambahkan coin ke watchlist.

### 6.4 Journey: Track Portfolio

1. User membuka halaman portfolio.
2. User menambahkan aset, jumlah kepemilikan, dan harga beli opsional.
3. Sistem menghitung nilai portfolio berdasarkan harga live.
4. User melihat total value, P/L nominal, dan P/L persentase.
5. User dapat mengedit atau menghapus holding.

### 6.5 Journey: Create Price Alert

1. User membuka halaman alerts atau modal dari coin detail.
2. User memilih coin, kondisi, dan target harga.
3. Sistem menyimpan alert secara lokal.
4. Saat harga memenuhi kondisi dan browser aktif, sistem mengirim browser notification.
5. User dapat menghapus alert aktif.

---

## 7. Functional Requirements

### F-01 — Live Price Crypto

**Description:**  
Dashboard harus menampilkan harga crypto secara real-time menggunakan WebSocket.

**Requirements:**

- F-01.1 Sistem menampilkan harga live untuk minimal 20 aset crypto utama.
- F-01.2 Harga default minimal mencakup BTC, ETH, BNB, SOL, XRP.
- F-01.3 Harga berubah otomatis tanpa refresh halaman.
- F-01.4 Perubahan harga divisualisasikan dengan warna dan ikon arah.
- F-01.5 Sistem menampilkan status koneksi: connected, reconnecting, disconnected.
- F-01.6 Jika WebSocket disconnect, sistem mencoba reconnect otomatis.
- F-01.7 Jika WebSocket gagal, sistem dapat menampilkan data terakhir dengan label stale.

**Acceptance Criteria:**

- User melihat update harga tanpa reload.
- Saat koneksi putus, indikator status berubah.
- Sistem melakukan reconnect tanpa aksi user.
- UI tidak crash saat data price kosong atau terlambat.

---

### F-02 — Market Overview

**Description:**  
Dashboard menampilkan ringkasan market untuk membantu user memahami kondisi pasar.

**Requirements:**

- F-02.1 Tampilkan price, 24h change, 24h volume, market cap, 24h high, dan 24h low.
- F-02.2 User dapat sort berdasarkan price, market cap, volume, dan 24h change.
- F-02.3 Data market ditampilkan dalam table atau card yang mudah dipindai.
- F-02.4 Setiap coin memiliki link ke halaman detail.

**Acceptance Criteria:**

- Data utama tampil jelas di dashboard.
- Sorting bekerja sesuai kolom yang dipilih.
- Empty/error state tersedia jika data gagal dimuat.

---

### F-03 — Search Coin

**Description:**  
User dapat mencari coin berdasarkan nama atau symbol.

**Requirements:**

- F-03.1 Search mendukung symbol, contoh BTC.
- F-03.2 Search mendukung nama, contoh Bitcoin.
- F-03.3 Hasil pencarian muncul dalam < 500ms setelah input.
- F-03.4 User dapat membuka detail coin dari hasil search.
- F-03.5 Jika tidak ada hasil, tampilkan empty state.

**Acceptance Criteria:**

- Search menemukan coin valid berdasarkan nama atau symbol.
- Empty state muncul untuk keyword tidak valid.
- Search tidak mengganggu performa dashboard.

---

### F-04 — Watchlist

**Description:**  
User dapat menyimpan daftar coin favorit.

**Requirements:**

- F-04.1 User dapat menambahkan coin ke watchlist.
- F-04.2 User dapat menghapus coin dari watchlist.
- F-04.3 Watchlist tersimpan di localStorage untuk MVP.
- F-04.4 Watchlist menampilkan price, 24h change, dan volume.
- F-04.5 Watchlist tetap tersedia setelah browser refresh.

**Acceptance Criteria:**

- Coin yang ditambahkan muncul di watchlist.
- Coin yang dihapus tidak muncul lagi.
- Data watchlist persist setelah refresh.

---

### F-05 — Coin Detail Page

**Description:**  
Halaman detail coin menampilkan informasi lengkap satu aset.

**Requirements:**

- F-05.1 Route halaman: `/coin/[symbol]`.
- F-05.2 Tampilkan coin name, symbol, logo, price, 24h change, market cap, volume, high/low.
- F-05.3 Tampilkan chart harga.
- F-05.4 Tampilkan technical analysis section.
- F-05.5 User dapat menambahkan coin ke watchlist dari halaman detail.
- F-05.6 User dapat membuat alert dari halaman detail.

**Acceptance Criteria:**

- Coin detail dapat dibuka dari dashboard, search, dan watchlist.
- Data coin tampil konsisten.
- Error state tersedia jika symbol tidak valid.

---

### F-06 — Price Chart

**Description:**  
User dapat melihat pergerakan harga melalui chart interaktif.

**Requirements:**

- F-06.1 Chart mendukung timeframe 1H, 24H, 7D, 30D.
- F-06.2 MVP minimal menggunakan line chart.
- F-06.3 Chart menampilkan tooltip harga dan waktu.
- F-06.4 Chart responsif di desktop, tablet, dan mobile.
- F-06.5 Versi lanjutan dapat mendukung candlestick chart.

**Acceptance Criteria:**

- User dapat mengganti timeframe.
- Chart update sesuai timeframe yang dipilih.
- Chart tetap terbaca pada viewport kecil.

---

### F-07 — Portfolio Tracker

**Description:**  
User dapat mencatat kepemilikan crypto dan melihat nilai portfolio.

**Requirements:**

- F-07.1 User dapat menambahkan holding.
- F-07.2 Input minimal: coin dan quantity.
- F-07.3 Input opsional: average buy price.
- F-07.4 Sistem menghitung current value.
- F-07.5 Sistem menghitung total portfolio value.
- F-07.6 Sistem menghitung P/L nominal dan persentase jika buy price tersedia.
- F-07.7 User dapat edit dan delete holding.
- F-07.8 Data tersimpan di localStorage untuk MVP.

**Acceptance Criteria:**

- Holding tersimpan setelah refresh.
- Total portfolio berubah mengikuti live price.
- P/L dihitung akurat berdasarkan input user.
- Input quantity tidak boleh negatif.

---

### F-08 — Price Alert

**Description:**  
User dapat membuat alert harga lokal saat browser aktif.

**Requirements:**

- F-08.1 User dapat memilih coin.
- F-08.2 User dapat memilih kondisi: greater than atau less than.
- F-08.3 User dapat mengisi target price.
- F-08.4 Alert tersimpan di localStorage.
- F-08.5 Sistem meminta izin browser notification.
- F-08.6 Notification muncul saat kondisi terpenuhi dan browser aktif.
- F-08.7 User dapat menghapus alert.
- F-08.8 Alert yang sudah trigger diberi status triggered.

**Acceptance Criteria:**

- Alert valid dapat dibuat.
- Alert invalid ditolak dengan pesan error.
- Notification muncul saat kondisi terpenuhi.
- Alert dapat dihapus.

**MVP Limitation:**  
Alert hanya berjalan selama browser/tab aktif. Alert server-side masuk future scope.

---

### F-09 — Fear & Greed Index

**Description:**  
Dashboard menampilkan indikator sentimen market crypto.

**Requirements:**

- F-09.1 Tampilkan nilai Fear & Greed Index.
- F-09.2 Tampilkan label: Extreme Fear, Fear, Neutral, Greed, Extreme Greed.
- F-09.3 Data diperbarui minimal 1x per hari.
- F-09.4 Tampilkan last updated timestamp.
- F-09.5 Tampilkan fallback jika API gagal.

**Acceptance Criteria:**

- Nilai dan label tampil di dashboard.
- Jika API error, dashboard tetap berjalan.

---

### F-10 — Dark Mode

**Description:**  
Dashboard menggunakan dark mode sebagai default.

**Requirements:**

- F-10.1 Dark mode aktif secara default.
- F-10.2 User dapat mengganti theme jika light mode tersedia.
- F-10.3 Preferensi theme tersimpan di localStorage.
- F-10.4 Warna teks, chart, card, dan table memenuhi kontras yang baik.
- F-10.5 Perubahan harga tidak hanya mengandalkan warna, tetapi juga ikon/label.

**Acceptance Criteria:**

- Theme tidak reset setelah refresh.
- Teks utama terbaca jelas.
- Up/down price change dapat dipahami tanpa hanya mengandalkan warna.

---

### F-12 — Coin Registry and Symbol Mapping

**Description:**  
Sistem harus memiliki registry coin internal untuk menjembatani perbedaan format symbol antara UI, Binance, dan CoinGecko.

**Requirements:**

- F-12.1 Setiap coin default memiliki `symbol`, `name`, `coingeckoId`, `binanceSymbol`, dan `quoteAsset`.
- F-12.2 Search MVP menggunakan registry lokal terlebih dahulu, bukan API request per keypress.
- F-12.3 Data dari Binance dan CoinGecko harus dinormalisasi ke model internal sebelum dipakai UI.
- F-12.4 Jika symbol tidak punya mapping valid, coin tidak boleh ditampilkan sebagai tradable/live asset.
- F-12.5 Registry MVP minimal mencakup 20 aset default yang sudah diverifikasi.

**Acceptance Criteria:**

- BTC dapat dipetakan ke `BTC`, `bitcoin`, dan `BTCUSDT` dengan benar.
- Search, live price, metadata, dan chart memakai mapping yang konsisten.
- Coin tanpa mapping valid tidak menyebabkan chart atau WebSocket error.

---

### F-13 — Market Pulse and Connection Status

**Description:**  
Dashboard harus menampilkan status live/stale data secara jelas melalui Market Pulse Strip atau connection indicator.

**Requirements:**

- F-13.1 Tampilkan status `Live`, `Reconnecting`, atau `Stale`.
- F-13.2 Tampilkan timestamp update terakhir jika tersedia.
- F-13.3 Desktop pulse strip maksimal menampilkan status, last update, BTC, ETH, satu coin tambahan, dan Fear & Greed compact.
- F-13.4 Mobile pulse strip dibuat ringkas dan tidak mengganggu konten utama.

**Acceptance Criteria:**

- User dapat mengetahui apakah harga masih live atau stale.
- Status berubah ketika WebSocket disconnect/reconnect.
- Pulse strip tidak menjadi visual noise di mobile.

---

### F-14 — Clean Mode and Technical Mode

**Description:**  
Coin detail harus mendukung mode tampilan agar user bisa memilih antara chart sederhana dan chart dengan indikator teknikal.

**Requirements:**

- F-14.1 Clean Mode menampilkan chart, timeframe, dan market stats tanpa panel teknikal berat.
- F-14.2 Technical Mode menampilkan indicator toggles, overlays, RSI, MACD, volume, support/resistance, dan summary.
- F-14.3 Mode terakhir dapat disimpan secara lokal jika implementasi ringan.
- F-14.4 Technical Mode tetap menampilkan disclaimer finansial.

**Acceptance Criteria:**

- User dapat berpindah antara Clean Mode dan Technical Mode.
- Dashboard tidak terasa penuh untuk user yang hanya ingin melihat harga/chart.
- Technical Mode tidak menggunakan bahasa buy/sell eksplisit.

---

### F-11 — Technical Analysis

**Description:**  
User dapat melihat indikator teknikal dasar untuk membaca tren dan momentum harga.

**MVP Indicators:**

- Moving Average: MA 7, MA 25, MA 99.
- RSI.
- MACD.
- Volume indicator.
- Basic support and resistance.
- Trend label: Bullish, Bearish, Sideways.

**Requirements:**

- F-11.1 User dapat toggle indikator teknikal.
- F-11.2 MA ditampilkan sebagai overlay di chart.
- F-11.3 RSI menampilkan nilai dan status:
  - Overbought jika RSI > 70.
  - Oversold jika RSI < 30.
  - Neutral jika RSI 30–70.
- F-11.4 MACD ditampilkan dalam panel terpisah atau section teknikal.
- F-11.5 Volume ditampilkan sebagai histogram atau summary.
- F-11.6 Support/resistance dihitung secara sederhana dari historical high/low lokal.
- F-11.7 Sistem menampilkan ringkasan teknikal berbasis rule sederhana.
- F-11.8 Tampilkan disclaimer: analisis teknikal bukan nasihat finansial.

**Acceptance Criteria:**

- User dapat mengaktifkan dan menonaktifkan indikator.
- Indikator berubah sesuai coin dan timeframe.
- Ringkasan teknikal tidak menggunakan bahasa rekomendasi beli/jual eksplisit.
- Jika data historis tidak cukup, tampilkan state “insufficient data”.

---

## 8. Page and Navigation Structure

### 8.1 Routes

| Route | Page | Purpose |
|---|---|---|
| `/` | Dashboard Home | Ringkasan market, top coins, watchlist, Fear & Greed |
| `/coin/[symbol]` | Coin Detail | Chart, market stats, technical analysis, alert/watchlist action |
| `/watchlist` | Watchlist | Daftar coin favorit user |
| `/portfolio` | Portfolio | Tracking aset dan P/L |
| `/alerts` | Alerts | Membuat dan mengelola price alert |

### 8.2 Dashboard Home Components

- App header.
- Global search bar.
- Market summary cards.
- Top coins table.
- Watchlist preview.
- Fear & Greed widget.
- Mini chart area.
- Theme toggle.
- Connection status indicator.

### 8.3 Coin Detail Components

- Coin identity header.
- Live price and change indicator.
- Timeframe selector.
- Main price chart.
- Technical indicator toggles.
- Technical summary panel.
- Market stats.
- Add/remove watchlist action.
- Create alert action.

### 8.4 Portfolio Components

- Total portfolio value card.
- P/L summary.
- Asset allocation visual.
- Holdings table.
- Add/edit holding form.
- Delete confirmation.

### 8.5 Alerts Components

- Alert creation form.
- Active alerts list.
- Triggered alerts list.
- Notification permission status.
- Delete alert action.

---

## 9. UX and UI Requirements

### 9.1 Design Direction

Dashboard harus terasa:

- Professional.
- Fast.
- Dense but readable.
- Dark-first.
- Trading-oriented.
- Clean.
- Tidak playful.
- Tidak cluttered.

### 9.2 Visual Style

Recommended style:

- Background: dark navy/black.
- Cards: subtle border, low contrast elevation.
- Typography: clean sans-serif, high readability.
- Up movement: green + up icon.
- Down movement: red + down icon.
- Neutral movement: muted gray.
- Chart area menjadi visual anchor utama.
- Animation minimal dan fungsional.

### 9.3 Accessibility Requirements

- Text contrast minimal WCAG AA untuk teks utama.
- Form input memiliki label.
- Button memiliki accessible name.
- Keyboard navigation tersedia untuk search, forms, toggles, dan table actions.
- Price movement tidak hanya ditandai warna.
- Error message harus jelas dan spesifik.

---

## 10. Technical Requirements

### 10.1 Recommended Tech Stack

**Frontend:**

- Next.js.
- TypeScript.
- Tailwind CSS.
- shadcn/ui.
- Zustand.
- TanStack Query.
- TradingView Lightweight Charts.

**Data Sources:**

- Binance WebSocket API untuk live price.
- CoinGecko API untuk metadata, market cap, logo, volume.
- Binance Kline API atau CoinGecko market chart API untuk historical chart.
- Alternative.me API untuk Fear & Greed Index.

**Storage MVP:**

- localStorage untuk watchlist, portfolio, alerts, dan theme preference.

**Future Backend:**

- Node.js + Fastify/NestJS.
- PostgreSQL.
- Prisma.
- Redis.
- Socket.IO atau native WebSocket gateway.
- BullMQ untuk alert jobs.
- Auth.js atau Clerk untuk authentication.

### 10.2 Data Source Mapping

| Data Type | Primary Source | Notes |
|---|---|---|
| Live price | Binance WebSocket | Source utama untuk update real-time |
| Coin metadata | CoinGecko | Logo, name, category, market data |
| Market cap | CoinGecko | Bisa berbeda dari Binance price |
| Historical price | Binance Kline / CoinGecko | Disesuaikan dengan chart requirement |
| Fear & Greed | Alternative.me | Update harian |
| Technical indicators | Client-side calculation | Dihitung dari historical candles/prices |

### 10.3 Suggested Local Data Models

#### Watchlist Item

```ts
type WatchlistItem = {
  symbol: string;
  name: string;
  addedAt: string;
};
```

#### Portfolio Holding

```ts
type PortfolioHolding = {
  id: string;
  symbol: string;
  name: string;
  quantity: number;
  averageBuyPrice?: number;
  createdAt: string;
  updatedAt: string;
};
```

#### Price Alert

```ts
type PriceAlert = {
  id: string;
  symbol: string;
  condition: 'greater_than' | 'less_than';
  targetPrice: number;
  status: 'active' | 'triggered';
  createdAt: string;
  triggeredAt?: string;
};
```

#### Theme Preference

```ts
type ThemePreference = 'dark' | 'light' | 'system';
```

### 10.4 State Management Guidance

- Use **Zustand** untuk state lokal yang sering diakses: watchlist, portfolio, alerts, theme, live prices.
- Use **TanStack Query** untuk server/cache data: metadata, market chart, Fear & Greed.
- Pisahkan state live price dari metadata agar update WebSocket tidak menyebabkan rerender berlebihan.

### 10.5 WebSocket Requirements

- Support reconnect with exponential backoff or capped retry interval.
- Connection status must be visible to user.
- Avoid duplicate subscriptions.
- Clean up subscriptions on page unmount.
- Use fallback stale data when connection is unstable.

### 10.6 Error Handling Requirements

- API failure tidak boleh membuat seluruh dashboard crash.
- Setiap data widget memiliki loading, success, empty, and error state.
- Jika localStorage parse gagal, reset data terkait dengan aman.
- Jika notification permission denied, tampilkan status dan instruksi singkat.

---

## 11. Non-Functional Requirements

### 11.1 Performance

- Initial page load target < 3 detik.
- Search result render < 500ms.
- WebSocket reconnect maksimal 5 detik setelah disconnect.
- Dashboard tetap smooth untuk minimal 20 tracked assets.
- Chart interaction harus tetap responsif di browser modern.

### 11.2 Reliability

- App tetap berjalan jika salah satu API gagal.
- Data stale harus diberi timestamp.
- User local data tidak hilang saat refresh normal.
- Error boundary tersedia untuk area chart atau widget kompleks.

### 11.3 Security and Privacy

- MVP tidak meminta API key exchange user.
- MVP tidak menyimpan credential finansial.
- Portfolio disimpan lokal di browser.
- Tidak ada klaim rekomendasi finansial.
- Jika backend ditambahkan, semua request menggunakan HTTPS dan validasi input server-side.

### 11.4 Browser Support

- Chrome latest.
- Firefox latest.
- Safari latest.
- Edge latest.

### 11.5 Device Support

- Desktop-first.
- Tablet responsive.
- Mobile usable.
- Mobile native app tidak termasuk MVP.

### 11.6 Localization

- Bahasa MVP: TBD.
- Currency default: USD.
- Format angka harus readable:
  - `$67,245.20`
  - `+2.45%`
  - `$1.2B volume`

---

## 12. Analytics and Monitoring

### 12.1 Product Analytics Events

Track event berikut jika analytics dipasang:

- `coin_viewed`
- `coin_searched`
- `watchlist_item_added`
- `watchlist_item_removed`
- `portfolio_holding_added`
- `portfolio_holding_updated`
- `portfolio_holding_deleted`
- `alert_created`
- `alert_triggered`
- `alert_deleted`
- `chart_timeframe_changed`
- `technical_indicator_toggled`
- `theme_changed`

### 12.2 Technical Monitoring

Monitor:

- WebSocket disconnect frequency.
- API error rate.
- Chart rendering errors.
- LocalStorage parse errors.
- Notification permission denied rate.

---

## 13. Testing Strategy

### 13.1 Unit Tests

Prioritas unit test:

- Portfolio calculation.
- P/L calculation.
- Alert trigger logic.
- Technical indicator calculation.
- Watchlist reducer/store logic.
- Formatting utilities.

### 13.2 Integration Tests

Prioritas integration test:

- Search to coin detail navigation.
- Add/remove watchlist.
- Add/edit/delete portfolio holding.
- Create/delete alert.
- Theme persistence.
- API error fallback.

### 13.3 UI/UX Tests

Validasi:

- Responsive layout desktop/tablet/mobile.
- Dark mode contrast.
- Chart readability.
- Empty/error/loading states.
- Keyboard navigation for core controls.

### 13.4 Manual QA Checklist

- Dashboard loads without console error.
- Price updates live.
- WebSocket reconnect works after simulated disconnect.
- Watchlist persists after refresh.
- Portfolio persists after refresh.
- Alert triggers when target condition is met.
- Technical indicators render with enough historical data.
- App handles API failure gracefully.

---

## 14. Rollout Plan

### Phase 1 — Core Market Dashboard

**Goal:** Produk dapat menampilkan market live dengan UI dasar yang stabil.

**Deliverables:**

- Dashboard home.
- Live price WebSocket.
- Market overview table/cards.
- Search coin.
- Dark mode.
- Basic error/loading states.

### Phase 2 — Watchlist and Coin Detail

**Goal:** User dapat mempersonalisasi aset dan melihat detail coin.

**Deliverables:**

- Watchlist localStorage.
- `/watchlist` page.
- `/coin/[symbol]` page.
- Price chart.
- Timeframe selector.

### Phase 3 — Portfolio and Alerts

**Goal:** User dapat melacak aset dan membuat alert sederhana.

**Deliverables:**

- `/portfolio` page.
- Portfolio calculation.
- `/alerts` page.
- Browser notification alert.
- Alert state management.

### Phase 4 — Technical Analysis

**Goal:** User dapat membaca indikator teknikal dasar.

**Deliverables:**

- MA overlay.
- RSI.
- MACD.
- Volume indicator.
- Basic support/resistance.
- Trend label.
- Technical summary.
- Financial disclaimer.

### Phase 5 — Backend Upgrade

**Goal:** Data user dan alert dapat berjalan lintas device.

**Deliverables:**

- Authentication.
- PostgreSQL schema.
- User watchlist sync.
- User portfolio sync.
- Server-side alert worker.
- Telegram/email/push notification.

---

## 15. Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| CoinGecko API rate limit | Market metadata gagal dimuat | Cache data, kurangi polling, gunakan stale data, pertimbangkan paid API |
| Binance and CoinGecko price mismatch | User melihat angka berbeda antar widget | Tetapkan Binance sebagai source live price dan CoinGecko sebagai metadata |
| WebSocket instability | Harga tidak update | Reconnect otomatis, status indicator, fallback stale data |
| LocalStorage corruption | Data user lokal gagal dibaca | Safe parse, fallback reset per module, jangan crash app |
| Technical analysis disalahartikan | Risiko user menganggap sebagai nasihat finansial | Disclaimer, hindari sinyal buy/sell eksplisit |
| Chart performance issue | UI lambat | Batasi data points, memoization, lazy load chart |
| Browser notification blocked | Alert tidak muncul | Tampilkan permission state dan fallback UI status |

---

## 16. Development Notes

### 16.1 Recommended Implementation Order

1. Project setup: Next.js, TypeScript, Tailwind, shadcn/ui.
2. Layout shell: header, sidebar/nav, theme.
3. Data layer: CoinGecko metadata and Binance WebSocket.
4. Dashboard home.
5. Search.
6. Watchlist store and page.
7. Coin detail page and chart.
8. Portfolio store and page.
9. Alert logic and notification.
10. Fear & Greed widget.
11. Technical analysis module.
12. QA, performance pass, accessibility pass.

### 16.2 Suggested Folder Structure

```txt
src/
  app/
    page.tsx
    coin/[symbol]/page.tsx
    watchlist/page.tsx
    portfolio/page.tsx
    alerts/page.tsx
  components/
    layout/
    market/
    chart/
    portfolio/
    alerts/
    technical-analysis/
    ui/
  lib/
    api/
    websocket/
    indicators/
    formatting/
    storage/
  stores/
    use-market-store.ts
    use-watchlist-store.ts
    use-portfolio-store.ts
    use-alert-store.ts
    use-theme-store.ts
  types/
    market.ts
    portfolio.ts
    alert.ts
```

---

## 17. Open Questions

| Code | Question | Status |
|---|---|---|
| Q-01 | Bahasa produk: Indonesia, Inggris, atau bilingual? | TBD |
| Q-02 | Daftar default 20 coin apa saja? | TBD |
| Q-03 | Target utama lebih condong trader aktif atau investor jangka panjang? | TBD |
| Q-04 | Apakah login diperlukan sebelum MVP publik? | TBD |
| Q-05 | Alert MVP cukup browser notification atau langsung Telegram/email? | Proposed: browser notification |
| Q-06 | Chart MVP cukup line chart atau langsung candlestick? | Proposed: line chart first |
| Q-07 | Source utama historical chart: Binance Kline atau CoinGecko market chart? | TBD |
| Q-08 | Currency hanya USD atau perlu IDR juga? | TBD |
| Q-09 | Apakah rilis pertama mengikuti MVP Core saja sebelum portfolio/alert/TA? | Proposed: yes |
| Q-10 | Daftar registry 20–50 coin pertama apa saja? | TBD |
| Q-11 | Apakah mobile top coins wajib card-list, bukan horizontal table? | Proposed: card-list |

---

## 18. Final Recommendation

Untuk tahap pengembangan awal, gunakan pendekatan **frontend-first MVP** tanpa backend wajib.

**Rationale:**

- Lebih cepat dirilis.
- Risiko teknis lebih rendah.
- Tidak membutuhkan auth dan database di awal.
- WebSocket Binance cukup untuk live price.
- localStorage cukup untuk validasi watchlist, portfolio, alerts, dan theme.
- Backend dapat ditambahkan setelah fitur inti terbukti useful.

**Recommended MVP Priority:**

1. Live dashboard.
2. Search.
3. Watchlist.
4. Coin detail + chart.
5. Portfolio tracker.
6. Price alert lokal.
7. Fear & Greed Index.
8. Technical analysis.

---

## 19. Financial Disclaimer

Produk ini hanya menyediakan informasi market, visualisasi data, dan indikator teknikal. Produk ini bukan penasihat keuangan dan tidak memberikan rekomendasi beli, jual, atau hold. User bertanggung jawab atas keputusan investasinya sendiri.

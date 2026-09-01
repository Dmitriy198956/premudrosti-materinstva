/**
 * CLI-прогон бэктеста:  npx tsx scripts/backtest.ts [флаги]
 *
 *   --symbol LINK/USDT     символ (дефолт LINK/USDT)
 *   --days 30              дней 1m-истории для синтетики (дефолт 30)
 *   --seed 42              seed генератора (детерминировано)
 *   --sims 1000            прогонов Монте-Карло
 *   --file candles.json    реальные свечи вместо синтетики:
 *                          {"symbol":"LINK/USDT","interval":"1m","candles":[{time,open,high,low,close,volume},...]}
 *   --flip                 эксперимент FLIP: одна пара, всегда в позиции,
 *                          направление по дисбалансу спроса/предложения (CVD+стакан)
 *   --flip-threshold 34    порог дисбаланса для переворота
 *   --flip-always 1        1 = всегда в позиции (2 режима), 0 = с нейтралью
 *
 * Прогоняет ТОТ ЖЕ мозг (Brain: CPU+RAM+HDD+логика), что и live-терминал:
 * восприятие → мысль → вход → SL/TP/трейлинг/time-stop → обучение весов.
 * Артефакты: backtest/latest.md (отчёт), backtest/latest.json (gitignored).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { DEFAULT_SETTINGS } from "../src/data/defaults";
import {
  generateSyntheticCandles,
  monteCarlo,
  runBacktest,
  sliceFillsByPeriod,
} from "../src/engine/backtest";
import type { Candle, Settings } from "../src/types";

function arg(name: string, dflt: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
}

const symbol = arg("symbol", "LINK/USDT");
const days = Number(arg("days", "30"));
const seed = Number(arg("seed", "42"));
const sims = Number(arg("sims", "1000"));
const file = arg("file", "");

const settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as Settings;
settings.ea.symbol = symbol;

const flipMode = process.argv.includes("--flip");
if (flipMode) {
  settings.flip = {
    ...settings.flip,
    enabled: true,
    symbol,
    threshold: Number(arg("flip-threshold", String(settings.flip.threshold))),
    alwaysIn: arg("flip-always", settings.flip.alwaysIn ? "1" : "0") === "1",
  };
}

let candles: Candle[];
let source: string;
if (file) {
  const j = JSON.parse(readFileSync(file, "utf8")) as { symbol?: string; candles: Candle[] };
  candles = j.candles;
  if (!Array.isArray(candles) || candles.length < 500) throw new Error("file: нужно ≥500 свечей");
  source = `real klines ← ${file}`;
} else {
  candles = generateSyntheticCandles({ seed, bars: Math.round(days * 1440), startPrice: 100 });
  source = `SYNTHETIC seeded rnd (seed=${seed}) — механика/риск, НЕ доказательство edge`;
}
candles = [...candles].sort((a, b) => a.time - b.time);

console.log(`⏳ backtest ${symbol} · ${candles.length} свечей 1m · источник: ${source}${flipMode ? ` · FLIP-режим (порог ${settings.flip.threshold}, ${settings.flip.alwaysIn ? "всегда в позиции" : "с нейтралью"})` : ""}`);
const t0 = Date.now();
const r = runBacktest({ symbol, candles }, settings);
console.log(`✅ готово за ${((Date.now() - t0) / 1000).toFixed(1)}с · сделок: ${r.metrics.trades}`);

const mc = monteCarlo(r.fills.filter((f) => f.pnl !== 0).map((f) => f.pnl), sims, seed);
const weeks = sliceFillsByPeriod(r.fills, 7 * 86_400_000);
const m = r.metrics;
const f2 = (v: number) => v.toFixed(2);
const firstT = new Date(candles[0].time).toISOString().slice(0, 10);
const lastT = new Date(candles[candles.length - 1].time).toISOString().slice(0, 10);

// ── Диагностика: сет-апы и удержание ──
const asc = [...r.fills].sort((a, b) => a.time - b.time);
let openEntry: (typeof asc)[number] | null = null;
const holdsMin: number[] = [];
for (const f of asc) {
  if (f.pnl === 0) { openEntry = f; continue; }
  if (openEntry) holdsMin.push((f.time - openEntry.time) / 60_000);
  openEntry = null;
}
const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

const exitsMd = Object.entries(m.exits)
  .sort((a, b) => b[1] - a[1])
  .map(([k, v]) => `| ${k} | ${v} |`)
  .join("\n");
const weeksMd = weeks
  .map(
    (w) =>
      `| ${new Date(w.start).toISOString().slice(0, 10)} | ${w.metrics.trades} | ${f2(w.metrics.netPnl)} | ${f2(w.metrics.winrate)}% | ${w.metrics.profitFactor === Infinity ? "∞" : f2(w.metrics.profitFactor)} | ${f2(w.metrics.maxDrawdown)} |`,
  )
  .join("\n");
const setupsMd = r.learning.setups
  .map((s) => `| ${s.setup} | ${s.trades} | ${f2(s.winrate)}% | ${s.profitFactor === Infinity ? "∞" : f2(s.profitFactor)} | ×${f2(s.weight)} |`)
  .join("\n");

const report = `# Backtest отчёт — NeuroScalp · ${symbol}

**Дата прогона:** ${new Date().toISOString()}
**Период данных:** ${firstT} → ${lastT} (${candles.length} × 1m)
**Источник данных:** ${source}
**Движок:** тот же мозг, что в live (Brain: CPU-цикл + RAM-фичи + HDD-обучение) + managePositions/applyFill.
SL/TP по high/low бара (при двойном касании — SL), трейлинг по закрытиям, MTF из ресемплированных серий.
Комиссия ${settings.ea.commission}% + slippage ${settings.ea.slippagePct}% + funding ${settings.ea.fundingPct}%/8ч.
Подтверждений до входа: ${settings.brain.confirmations} · min score ${settings.brain.gates.minScore} · time-stop ${settings.brain.timeStopSeconds}с.
${flipMode ? `**РЕЖИМ:** FLIP-эксперимент — одна пара ${symbol}, ${settings.flip.alwaysIn ? "всегда в позиции (LONG ⇄ SHORT)" : "с нейтралью"}, направление по дисбалансу спроса/предложения (CVD ${settings.flip.window} баров + ускорение + стакан), порог |скор| ≥ ${settings.flip.threshold}, SL ${settings.flip.slAtr} ATR, пауза переворотов ${settings.flip.minFlipGapMinutes} мин, вето оркестратора ${settings.flip.orchestratorVeto ? "вкл" : "выкл"}.` : ""}

## Сводка

| Метрика | Значение |
|---|---|
| Equity старт → финал | ${f2(m.startEquity)} → ${f2(m.endEquity)} USDT |
| Net PnL | ${f2(m.netPnl)} USDT (${f2(m.netPnlPct)}%) |
| Сделок (закрытых) | ${m.trades} (входов ${m.entries}) |
| Winrate | ${f2(m.winrate)}% (${m.wins}W/${m.losses}L/${m.breakeven}BE) |
| Profit Factor | ${m.profitFactor === Infinity ? "∞" : f2(m.profitFactor)} |
| Expectancy | ${f2(m.expectancy)} USDT/сделку |
| Avg win / avg loss | ${f2(m.avgWin)} / ${f2(m.avgLoss)} |
| Max Drawdown (по equity-кривой) | ${f2(m.maxDrawdown)} USDT (${f2(m.maxDrawdownPct)}%) |
| Комиссии всего | ${f2(m.commissions)} USDT |
| Фандинг всего | ${f2(m.funding)} USDT |
| Среднее удержание | ${f2(avg(holdsMin))} мин |

## Обучение мозга за прогон (HDD)

| Сет-ап | Сделок | Winrate | PF | Выученный вес |
|---|---|---|---|---|
${setupsMd || "| — | 0 | 0 | 0 | ×1.00 |"}

${r.learning.notes.length ? `Рефлексии:\n${r.learning.notes.map((n) => `- ${n}`).join("\n")}` : "Рефлексий не потребовалось (мало сделок для переучивания весов)."}

## Причины закрытий

| Причина | Кол-во |
|---|---|
${exitsMd || "| — | 0 |"}

## Walk-forward-lite (стабильность по неделям)

| Неделя | Сделок | Net PnL | Winrate | PF | MaxDD |
|---|---|---|---|---|---|
${weeksMd || "| — | 0 | 0 | 0 | 0 | 0 |"}

## Monte-Carlo (${mc.sims} перестановок порядка сделок, seed=${seed})

| Метрика | Значение |
|---|---|
| MaxDD медиана / p95 | ${f2(mc.maxDDp50)} / ${f2(mc.maxDDp95)} USDT |
| Net PnL p5 / p50 | ${f2(mc.netPnlP5)} / ${f2(mc.netPnlP50)} USDT |
| P(итог < 0) | ${(mc.probNetNegative * 100).toFixed(1)}% |

## Честные оговорки

- Данные по умолчанию — **синтетика**: отчёт доказывает корректность механики, учёта и риск-контуров, а НЕ наличие edge.
- Реальный свечной прогон: \`npm run backtest -- --file candles.json\`.
- Входы в candle-бэктесте — на закрытой свече (в live — intrabar): активность/результаты в live будут отличаться в обе стороны.
- Трейлинг в candle-бэктесте — по закрытиям баров (грубее лайв-тиков).
`;

mkdirSync("backtest", { recursive: true });
writeFileSync("backtest/latest.md", report);
writeFileSync("backtest/latest.json", JSON.stringify({ symbol, source, metrics: m, monteCarlo: mc, learning: r.learning, equityCurve: r.equityCurve, fills: r.fills }, null, 2));

console.log(report);

#!/usr/bin/env node
/**
 * Renders ASSETS.sequences.car from the car GLB (dev server must be running):
 *   node scripts/render-car.mjs [--base http://localhost:5199] [--frames 60]
 * Writes public/sequences/car/f001.webp … and public/sequences/car/outline.svg
 *   node scripts/render-car.mjs --tech
 * Writes public/models/car/mercedes-amg-c63.tech.bin (the digital twin: edges, samples, nodes)
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright'

const args = Object.fromEntries(process.argv.slice(2).join(' ').split('--').filter(Boolean).map((kv) => kv.trim().split(/\s+/)))
const base = args.base || 'http://localhost:5199'
const n = Number(args.frames || 60)
const out = 'public/sequences/car'
mkdirSync(out, { recursive: true })

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--headless=new', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
page.on('pageerror', (e) => console.error('page error:', e))
page.on('console', (m) => m.type() === 'error' && console.error('console:', m.text()))
await page.goto(`${base}/scripts/render-car/index.html`)
await page.waitForFunction(() => window.renderCar, null, { timeout: 60_000 })
await page.evaluate(() => window.renderCar.ready)
if ('tech' in args) {
  // the car's digital twin only: node scripts/render-car.mjs --tech
  const { header, b64 } = await page.evaluate(() => window.renderCar.tech())
  writeFileSync('public/models/car/mercedes-amg-c63.tech.bin', Buffer.from(b64, 'base64'))
  console.log('wrote public/models/car/mercedes-amg-c63.tech.bin', JSON.stringify(header))
  await browser.close()
  process.exit(0)
}
for (let i = 0; i < n; i++) {
  const url = await page.evaluate(([i, n]) => window.renderCar.frame(i, n), [i, n])
  writeFileSync(`${out}/f${String(i + 1).padStart(3, '0')}.webp`, Buffer.from(url.split(',')[1], 'base64'))
}
console.log(`wrote ${n} frames to ${out}/`)
const svg = await page.evaluate(() => window.renderCar.outline())
writeFileSync(`${out}/outline.svg`, svg)
console.log(`wrote ${out}/outline.svg (${svg.length} bytes)`)
await browser.close()

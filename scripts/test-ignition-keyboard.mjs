// Production check: keyboard-only ignition, and repeated presses cannot start a second sequence.
import { chromium } from 'playwright'
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--headless=new', '--use-angle=metal'] })
const p = await b.newPage({ viewport: { width: 1440, height: 900 } })
await p.goto(process.argv[2] || 'http://localhost:5299/')
await p.waitForFunction(() => !document.querySelector('.ignition-hit')?.hasAttribute('disabled'), null, { timeout: 90000 })
await p.waitForTimeout(1500)
const order = []
for (let i = 0; i < 5; i++) {
  await p.keyboard.press('Tab')
  const el = await p.evaluate(() => document.activeElement?.className || document.activeElement?.tagName)
  order.push(el)
  if (el.includes('ignition-hit')) break
}
await p.keyboard.press('Enter')
await p.waitForTimeout(120)
const disabledAfterFirst = await p.evaluate(() => document.querySelector('.ignition-hit').disabled)
await p.keyboard.press('Enter')
await p.keyboard.press('Space')
await p.mouse.click(720, 450)
const state = await p.evaluate(() => document.querySelector('.ignition').dataset.state)
await p.waitForFunction(() => !document.documentElement.classList.contains('scroll-locked'), null, { timeout: 15000 })
console.log(JSON.stringify({ tabOrder: order, disabledAfterFirst, stateDuringIgnition: state, unlocked: true }))
await b.close()

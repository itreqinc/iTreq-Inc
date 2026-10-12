import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir, platform } from 'node:os'
import { dirname, join } from 'node:path'
import puppeteer from 'puppeteer-core'

const require = createRequire(import.meta.url)

let browserPromise = null

function systemBrowserPath() {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.EDGE_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    join(homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ]
  return candidates.find((candidate) => candidate && existsSync(candidate)) || ''
}

async function launchBrowser() {
  const executablePath = systemBrowserPath()
  if (executablePath) {
    return puppeteer.launch({
      executablePath,
      headless: true,
      protocolTimeout: 120_000,
      args: ['--disable-extensions', '--no-first-run', '--no-default-browser-check'],
    })
  }

  const chromium = (await import('@sparticuz/chromium')).default
  if ('setGraphicsMode' in chromium) chromium.setGraphicsMode = false
  return puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: true,
    defaultViewport: { width: 794, height: 1123 },
    protocolTimeout: 120_000,
  })
}

export async function closePrintBrowser() {
  const pending = browserPromise
  browserPromise = null
  if (!pending) return
  try {
    const browser = await pending
    await browser.close()
  } catch {
    /* already closed */
  }
}

function getBrowser() {
  if (!browserPromise) {
    browserPromise = launchBrowser()
    browserPromise
      .then((browser) => {
        browser.on('disconnected', () => {
          browserPromise = null
        })
      })
      .catch(() => {
        browserPromise = null
      })
  }
  return browserPromise
}

/**
 * Linux hosts have no Arial. Arimo uses the same character widths, under the
 * Arial family name, so a hosted print keeps the same breaks and rules.
 * Windows uses the installed Arial, which is what Print / Save uses.
 */
function linuxArialStyle() {
  if (platform() === 'win32') return ''
  let root = ''
  try {
    root = dirname(require.resolve('@fontsource/arimo/package.json'))
  } catch {
    return ''
  }
  const faces = [
    ['400', 'arimo-latin-400-normal.woff2'],
    ['700', 'arimo-latin-700-normal.woff2'],
  ]
  const rules = []
  for (const [weight, file] of faces) {
    const filePath = join(root, 'files', file)
    if (!existsSync(filePath)) continue
    const href = `data:font/woff2;base64,${readFileSync(filePath).toString('base64')}`
    rules.push(
      `@font-face{font-family:Arial;src:url("${href}") format("woff2");font-weight:${weight};font-style:normal;}`,
    )
  }
  if (!rules.length) return ''
  return `<style>${rules.join('')}</style>`
}

function withHostFonts(html) {
  const style = linuxArialStyle()
  if (!style) return html
  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, `${style}</head>`)
  return `${style}${html}`
}

/**
 * Print the Print / Save HTML with the browser print engine.
 * The HTML is not redrawn.
 * @param {string} html
 * @returns {Promise<string>} base64 PDF, no data-URI prefix
 */
export async function printHtmlToPdfBase64(html) {
  if (typeof html !== 'string' || !html.trim()) {
    throw new Error('Missing document.')
  }
  if (html.length > 12_000_000) {
    throw new Error('Document is too large to print.')
  }

  let browser
  try {
    browser = await getBrowser()
  } catch (err) {
    browserPromise = null
    const detail = err?.message ? ` ${err.message}` : ''
    throw new Error(`Could not open the browser that prints these documents.${detail}`)
  }

  const page = await browser.newPage()
  try {
    await page.emulateMediaType('print')
    await page.setContent(withHostFonts(html), { waitUntil: 'load', timeout: 45_000 })
    await page.evaluate(async () => {
      if (document.fonts?.ready) await document.fonts.ready
      await Promise.all(
        [...document.images].map(
          (img) =>
            img.complete
              ? null
              : new Promise((resolve) => {
                  img.addEventListener('load', () => resolve(), { once: true })
                  img.addEventListener('error', () => resolve(), { once: true })
                }),
        ),
      )
    })
    const pdf = await page.pdf({
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: false,
      scale: 1,
    })
    return Buffer.from(pdf).toString('base64')
  } finally {
    await page.close().catch(() => {})
  }
}

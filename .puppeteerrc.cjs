/**
 * Puppeteer configuration.
 *
 * The bundled Chromium download is skipped so `npm install` stays fast and
 * browser-free — the Cloudflare Pages build runs that install too, and it must
 * never fetch a browser. (`puppeteer_skip_download` in .npmrc is a legacy
 * setting that puppeteer >= 22 no longer reads; this file is the supported way.)
 *
 * scripts/ui-browsers.mjs re-enables the download just for itself by running
 * puppeteer with PUPPETEER_SKIP_DOWNLOAD=false, which overrides this file.
 */
module.exports = {
  skipDownload: true,
}

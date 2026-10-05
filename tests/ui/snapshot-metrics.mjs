// Snapshot tab: every control must be a real, themed, comfortably-sized control.
//
// Regression guard for the bug where the export/import buttons used
// `btn-primary` WITHOUT the `.btn` base class, so they lost all padding and
// rendered ~21px tall, and where the <select>s and file input fell back to
// native browser chrome.

import { collectFindings } from '../../scripts/lib/audit-page.mjs'
import { SEED, clickButtonByText, openPage, settle } from '../../scripts/lib/browser.mjs'

export const name = 'snapshot-metrics'

export default async function run({ check, baseUrl, browser }) {
  const page = await openPage(browser, { url: baseUrl + '#/settings', seed: SEED })
  await clickButtonByText(page, 'Snapshot')

  const controls = await page.evaluate(() => {
    const read = (el) => {
      const r = el.getBoundingClientRect()
      const c = getComputedStyle(el)
      return {
        tag: el.tagName.toLowerCase(),
        classes: typeof el.className === 'string' ? el.className : '',
        text: (el.textContent || '').trim().slice(0, 30),
        label: el.getAttribute('aria-label') || '',
        w: Math.round(r.width),
        h: Math.round(r.height),
        radius: c.borderRadius,
        border: c.borderStyle + ' ' + c.borderWidth,
        fontSize: c.fontSize,
        padding: c.padding,
      }
    }
    return {
      buttons: [...document.querySelectorAll('.data-settings button')].map(read),
      selects: [...document.querySelectorAll('.data-settings select')].map(read),
      fileInputs: [...document.querySelectorAll('.file-input input[type="file"]')].map(read),
    }
  })

  // 3 export/import actions + (with a never-backed-up seed) the backup
  // nudge's icon-only dismiss. Icon buttons use the app-wide .btn-icon
  // pattern — they are exempt from the .btn base-class rule but not from
  // the size/radius/label rules, and they must carry an aria-label.
  const dismiss = controls.buttons.find((b) => b.label === 'Dismiss backup reminder')
  const actionButtons = controls.buttons.filter((b) => b !== dismiss)
  check('snapshot renders 3 export/import buttons', actionButtons.length === 3, `got ${actionButtons.length}`)
  check('backup nudge offers a labelled dismiss button', !!dismiss && dismiss.label.length > 0, dismiss ? dismiss.classes : 'no nudge button')
  check('snapshot renders 2 selects', controls.selects.length === 2, `got ${controls.selects.length}`)
  check('snapshot renders 1 file input', controls.fileInputs.length === 1, `got ${controls.fileInputs.length}`)

  for (const b of controls.buttons) {
    const name = b.text || b.label
    check(
      `button "${name}" carries a themed button class`,
      b.classes.split(/\s+/).some((c) => c === 'btn' || c === 'btn-icon'),
      b.classes,
    )
    check(`button "${name}" is >= 32px tall`, b.h >= 32, `${b.w}x${b.h}`)
    check(`button "${name}" has a radius`, parseFloat(b.radius) > 0, b.radius)
    check(`button "${name}" is named`, (b.text + b.label).length > 0, b.classes)
  }
  for (const s of controls.selects) {
    check(`select "${s.label}" is >= 32px tall`, s.h >= 32, `${s.w}x${s.h}`)
    check(`select "${s.label}" is themed (border + radius)`, s.border.includes('solid') && parseFloat(s.radius) > 0, `${s.border} / ${s.radius}`)
    check(`select "${s.label}" is labelled`, s.label.length > 0)
  }
  for (const f of controls.fileInputs) {
    check('file input is >= 32px tall', f.h >= 32, `${f.w}x${f.h}`)
  }

  // The whole tab must still pass the general audit.
  const findings = await page.evaluate(collectFindings)
  check('no horizontal overflow on the snapshot tab', !findings.overflowX, `docW ${findings.docW} vs vw ${findings.vw}`)
  check('no undersized targets on the snapshot tab', findings.smallTargets.length === 0, JSON.stringify(findings.smallTargets))
  check('no unnamed controls on the snapshot tab', findings.noName.length === 0, JSON.stringify(findings.noName))
  check('no unlabeled inputs on the snapshot tab', findings.unlabeled.length === 0, JSON.stringify(findings.unlabeled))
  check('no contrast failures on the snapshot tab', findings.contrast.length === 0, JSON.stringify(findings.contrast))

  await settle(page, 0)
}

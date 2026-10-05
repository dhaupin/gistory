// Onboarding - first-run tour: welcome, first prompt, sync + pairing.
//
// Shows once per browser (gistory_onboarded flag in App). It deliberately
// does not duplicate any settings logic — each step deep-links into the real
// surface (EmptyState create flow, Settings sync tab) so there is exactly one
// place where sync is configured and paired.

import { useEffect, useState } from 'react'
import { MessageSquarePlus, Cloud, Smartphone, ChevronRight, ChevronLeft } from 'lucide-react'

interface OnboardingProps {
  hasThreads: boolean
  /** Create the first thread from the tour (closes it and opens the thread). */
  onCreateFirst: (name: string) => void
  onOpenSettings: () => void
  /** Any exit path — skip, done, or Escape. Marks the tour as seen. */
  onClose: () => void
}

const STEPS = ['Welcome', 'First prompt', 'Sync & pair']

export default function Onboarding({ hasThreads, onCreateFirst, onOpenSettings, onClose }: OnboardingProps) {
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [onClose])

  const trimmed = name.trim()

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal onboarding"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Welcome to Gistory"
      >
        <div className="onboarding-dots" aria-hidden="true">
          {STEPS.map((label, i) => (
            <span key={label} className={`dot${i === step ? ' active' : ''}`} />
          ))}
        </div>

        {step === 0 && (
          <>
            <h3 className="onboarding-title">Welcome to Gistory</h3>
            <p className="onboarding-body">
              Keep every prompt in one place: write it once, find it fast, copy it filled.
              Everything lives on this device until you turn on sync — then it is
              end-to-end encrypted across yours.
            </p>
            <div className="onboarding-actions">
              <button className="btn btn-ghost btn-small" onClick={onClose}>Skip tour</button>
              <button className="btn btn-primary btn-small" onClick={() => setStep(1)}>
                {hasThreads ? 'Next' : 'Get started'} <ChevronRight size={14} />
              </button>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <h3 className="onboarding-title"><MessageSquarePlus size={18} /> Create your first prompt</h3>
            {hasThreads ? (
              <>
                <p className="onboarding-body">
                  You already have prompts on this device. Open one from the board, or
                  add another with the <strong>+ Thread</strong> button.
                </p>
                <div className="onboarding-actions">
                  <button className="btn btn-ghost btn-small" onClick={() => setStep(0)}>
                    <ChevronLeft size={14} /> Back
                  </button>
                  <button className="btn btn-primary btn-small" onClick={() => setStep(2)}>
                    Next <ChevronRight size={14} />
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="onboarding-body">
                  A thread holds one prompt (or a whole conversation of variations).
                  Name it — you can rename it any time.
                </p>
                <input
                  className="input-name onboarding-input"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && trimmed) onCreateFirst(trimmed) }}
                  placeholder="e.g. Code review prompt"
                  aria-label="First thread name"
                  autoFocus
                />
                <div className="onboarding-actions">
                  <button className="btn btn-ghost btn-small" onClick={() => setStep(0)}>
                    <ChevronLeft size={14} /> Back
                  </button>
                  {/* Sync-first users must not be walled behind a create form. */}
                  <button className="btn btn-ghost btn-small" onClick={() => setStep(2)}>
                    Skip for now
                  </button>
                  <button className="btn btn-primary btn-small" disabled={!trimmed} onClick={() => onCreateFirst(trimmed)}>
                    Create prompt
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {step === 2 && (
          <>
            <h3 className="onboarding-title"><Cloud size={18} /> Sync across your devices</h3>
            <p className="onboarding-body">
              Sync uses one passphrase plus a pairing code. The passphrase never leaves
              your devices — the server only stores encrypted data, so pick something
              memorable: there is no reset.
            </p>
            <p className="onboarding-body">
              <Smartphone size={14} /> Then pair your phone or second laptop from
              Settings → Sync → <strong>Pair Device</strong>.
            </p>
            <div className="onboarding-actions">
              <button className="btn btn-ghost btn-small" onClick={() => setStep(1)}>
                <ChevronLeft size={14} /> Back
              </button>
              <button className="btn btn-secondary btn-small" onClick={onClose}>Later</button>
              <button className="btn btn-primary btn-small" onClick={onOpenSettings}>
                Open sync settings <ChevronRight size={14} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

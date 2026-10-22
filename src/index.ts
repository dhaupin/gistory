// 📦 npm entry barrel — the Gistory sync engine, importable anywhere.
//
// What this package IS on npm: the sync engine a Gistory client is built
// from — key derivation, E2EE push/pull, the pure merge rules, QoS
// scheduling, sync error shaping, and the storage seam — plus the shared
// data models. NOT the React app (it stays source-of-truth in the repo and
// deploys to Cloudflare Pages) and NOT the relay (D1/Pages Functions need
// no npm package; they ship at deploy time).
//
// Everything here runs without React: the service worker already imports
// the REAL agent/merge/idb modules with no copied logic, so the npm bundle
// is that same code in one file. Consumer shapes:
//
//   Web/mobile client   import { SyncAgent, mergePayload } from 'gistory'
//   Node/bun tooling    the same import — storage degrades to localStorage
//                       when IndexedDB is absent (see ./sync/idb.ts)
//
// House rule for anything landing here later: synced fields must keep old
// payloads mergeable (the `optional field, merge keeps old copies` pattern
// in settings/variables), because blobs travel between package versions.

export * from './sync/agent'
export {
  emptyDeleted,
  mergePayload,
  mergeRegistry,
  mergeSettings,
  mergeVariables,
  normalizeDeleted,
  type DeletedRegistry,
  type SyncData,
  type SyncPayload,
  type SyncSettings,
} from './sync/merge'
export * from './lib/variables'
export * from './lib/models'
export { describeDecryptFailures, errorMessage, type DecryptFailureInput } from './sync/errors'
export {
  PUSH_DEBOUNCE_MS,
  RETRY_BASE_MS,
  RETRY_MAX_MS,
  SyncQos,
  backoffDelay,
  isTerminalPushFailure,
  type QosState,
  type QosStatus,
  type SyncQosOptions,
} from './sync/qos'
export {
  applyFullOrder,
  applyOrder,
  emptyView,
  loadView,
  mergeView,
  moveItem,
  moveWithinSubset,
  needsRebalance,
  normalizeView,
  pruneView,
  rankBetween,
  saveView,
  sequentialRanks,
  viewKeyItem,
  viewTime,
  type ItemView,
  type ViewState,
} from './sync/view-state'
export {
  SYNC_KEYS,
  ensureStorageReady,
  isSyncKey,
  resetStorageSync,
  storageMode,
  stGetString,
  stKeyList,
  stSetString,
} from './sync/idb'

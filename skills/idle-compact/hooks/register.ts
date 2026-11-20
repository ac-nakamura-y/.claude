import type { Register, Timer } from 'claude-code'

// The session's prompt cache lives 1 hour; compact at 90% of it (54 minutes).
const CACHE_TTL_MS = 60 * 60 * 1000
const DELAY_MS = CACHE_TTL_MS * 0.9

export const register: Register = on => {
  let timer: Timer | undefined

  on('turn.start', ($, e, next) => {
    if (e.agentId === undefined) timer?.cancel()
    return next(e)
  })

  on('turn.complete', ($, e, next) => {
    if (e.agentId === undefined) {
      timer?.cancel()
      timer = $.clock.after(DELAY_MS, () => {
        $.session.compact().then(
          result => {
            if (result.skip !== undefined) $.ui.log(`idle-compact: skipped: ${result.skip}`)
          },
          (error: unknown) => $.ui.log(`idle-compact: failed: ${String(error)}`),
        )
      })
    }
    return next(e)
  })
}

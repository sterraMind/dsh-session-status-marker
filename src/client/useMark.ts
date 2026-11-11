/** @module React binding to the shared mark cache in `./marks.ts`. */

import { useState, useEffect } from 'react'
import type { MarkRecord } from '../contracts.js'
import { subscribeMarks, cachedMark, hasCachedMark } from './marks.js'

/** Current mark of one session plus whether the first read finished. */
export interface MarkState {
  readonly mark: MarkRecord | null
  readonly loading: boolean
}

/**
 * Track one session's mark through the shared subscription.
 * @param sessionId - Session whose badge or hover card is on screen.
 * @returns the newest mark and the initial-read flag.
 */
export function useMark(sessionId: string): MarkState {
  const [mark, setMark] = useState<MarkRecord | null>(() => cachedMark(sessionId))
  const [loading, setLoading] = useState(() => !hasCachedMark(sessionId))

  useEffect(() => {
    setMark(cachedMark(sessionId))
    setLoading(!hasCachedMark(sessionId))
    return subscribeMarks(sessionId, (next) => {
      setMark(next)
      setLoading(false)
    })
  }, [sessionId])

  return { mark, loading }
}

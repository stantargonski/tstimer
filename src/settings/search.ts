import { createContext } from 'react'

/** What is typed into the settings search, or '' when nothing is. */
export const SearchContext = createContext('')

/**
 * Whether every word of the query appears somewhere in `texts`.
 *
 * Words rather than the whole string, so "preview blind" finds "close the
 * preview for blindfolded events" without the words having to be in order.
 */
export function matches(query: string, texts: (string | undefined)[]): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const haystack = texts.filter(Boolean).join(' ').toLowerCase()
  return words.every((word) => haystack.includes(word))
}

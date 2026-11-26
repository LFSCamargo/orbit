import { describe, expect, it } from 'vitest'
import {
  groupCommits,
  isMergeCommit,
  parseCommitMessage,
  type ReleaseCommit,
} from '../commits'

describe('parseCommitMessage', () => {
  it('splits type, scope, breaking flag, subject and pull request', () => {
    expect(parseCommitMessage('feat(steam)!: sync on boot (#12)\n\nbody')).toEqual({
      type: 'feat',
      scope: 'steam',
      subject: 'sync on boot',
      breaking: true,
      pr: 12,
    })
  })

  it('reads the pull request from a merge commit and files unknown types as other', () => {
    expect(parseCommitMessage('Merge pull request #10 from org/branch').pr).toBe(10)
    expect(parseCommitMessage('wip: thing').type).toBe('other')
    expect(parseCommitMessage('Update README').type).toBe('other')
  })

  it('recognises merge commits', () => {
    expect(isMergeCommit('Merge pull request #10 from org/branch')).toBe(true)
    expect(isMergeCommit('fix: merge settings')).toBe(false)
  })
})

describe('groupCommits', () => {
  const commit = (type: string, sha: string): ReleaseCommit => ({
    sha,
    shortSha: sha,
    type,
    scope: null,
    subject: sha,
    breaking: false,
    pr: null,
    url: `https://github.com/x/commit/${sha}`,
  })

  it('puts features first and keeps commits in order within a group', () => {
    const groups = groupCommits([
      commit('fix', 'a'),
      commit('feat', 'b'),
      commit('fix', 'c'),
    ])
    expect(groups.map((group) => group.label)).toEqual(['Features', 'Fixes'])
    expect(groups[1].commits.map((item) => item.sha)).toEqual(['a', 'c'])
  })
})

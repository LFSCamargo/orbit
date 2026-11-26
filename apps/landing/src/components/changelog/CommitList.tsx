import { CommitIcon, PullRequestIcon } from '@/components/ui/icons'
import { groupCommits, type ReleaseCommit } from '@/lib/commits'
import { GITHUB_URL } from '@/lib/site'

/** Every commit in the release, grouped by Conventional Commit type, each
 * linked to its diff and pull request. */
export function CommitList({ commits }: { commits: ReleaseCommit[] }) {
  const groups = groupCommits(commits)
  if (!groups.length) return null
  return (
    <div className="grid gap-6 md:grid-cols-2">
      {groups.map((group) => (
        <section
          key={group.type}
          className="orbit-glass rounded-[20px] p-5"
          aria-label={group.label}
        >
          <h4 className="flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.18em] text-orbit-accent">
            {group.label}
            <span className="text-white/40">{group.commits.length}</span>
          </h4>
          <ul className="mt-4 space-y-3">
            {group.commits.map((commit) => (
              <li key={commit.sha} className="text-sm leading-6">
                <a
                  href={commit.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex gap-2 text-white/75 hover:text-white"
                >
                  <CommitIcon className="mt-1 h-4 w-4 shrink-0 text-white/35 group-hover:text-orbit-accent" />
                  <span>
                    {commit.scope && (
                      <span className="mr-1.5 rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[11px] text-orange-200">
                        {commit.scope}
                      </span>
                    )}
                    {commit.subject}
                    <span className="ml-2 font-mono text-[11px] text-white/35">
                      {commit.shortSha}
                    </span>
                  </span>
                </a>
                {commit.pr && (
                  <a
                    href={`${GITHUB_URL}/pull/${commit.pr}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-6 mt-1 inline-flex items-center gap-1 font-mono text-[11px] text-white/45 hover:text-orbit-accent"
                  >
                    <PullRequestIcon className="h-3.5 w-3.5" />#{commit.pr}
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

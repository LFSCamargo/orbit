import { useEffect, useState } from 'react'
import { clsx } from 'clsx'
import {
  ArrowUpRight,
  Eye,
  EyeOff,
  FolderOpen,
  Heart,
  RefreshCw,
  Library,
  Settings2,
  Trash2,
} from 'lucide-react'
import { TabList } from '@/components/ui/tab-list'
import { ConfirmDialog } from '@/components/feedback/ConfirmDialog'
import { Focusable } from '@/components/focus/Focusable'
import { focusManager } from '@/controllers/FocusManager'
import { useLibraryActions, useLibraryEntry } from '@/hooks/useLibrary'
import { useGameActions } from '@/hooks/useGames'
import { useSteamWindows } from '@/hooks/useSteamWindows'
import { backTarget, focusRestoreId } from '@/lib/navigation'
import { formatRelativeDate, providerLabel } from '@/lib/format'
import {
  entryCanSave,
  entryInstallStatus,
  isPlaceholderDescription,
  selectInstallation,
} from '@/lib/libraryEntries'
import { isOrbitManagedDownload } from '@/lib/libraryActions'
import { downloadSteamWindowsGame, enrichGameMetadata, revealPath } from '@/lib/tauri'
import { AchievementList } from './components/AchievementList'
import { DetailsHero } from './components/DetailsHero'
import { DetailsPrimaryAction } from './components/DetailsPrimaryAction'
import { DetailsSettings } from './components/DetailsSettings'
import { InstallationPicker } from './components/InstallationPicker'
import { DetailsRunInfo } from './components/DetailsRunInfo'
import { MetaGrid } from './components/MetaGrid'
import { useSessionStore } from '@/stores/session.store'
import { useUiStore } from '@/stores/ui.store'

const EYEBROWS = {
  installed: 'IN YOUR COLLECTION',
  unavailable: 'UNAVAILABLE',
  'not-installed': 'NOT INSTALLED',
}

const PAGE =
  'game-details relative isolate pb-14 text-orbit-foreground [&_button:disabled]:cursor-wait [&_button:disabled]:opacity-40 motion-reduce:[&_*]:scroll-auto motion-reduce:[&_*]:!transition-none'
const SECTION_HEADING =
  'details-section-heading mb-[22px] flex items-center justify-between gap-5 max-[520px]:gap-2.5'
const EYEBROW = 'details-eyebrow text-[9px] font-[650] tracking-[0.2em] text-orbit-accent'
const SECTION_TITLE =
  'mt-[7px] text-[21px] font-[550] tracking-[-0.035em] min-[1700px]:text-2xl max-[760px]:text-xl'
const DESCRIPTION =
  'details-description max-w-[760px] whitespace-pre-line text-[13px] leading-[1.95] text-white/[0.64] [overflow-wrap:anywhere] min-[1700px]:text-[15px]'

export function GameDetailsPage() {
  const selectedGameId = useUiStore((s) => s.selectedGameId)
  const previousScreen = useUiStore((s) => s.previousScreen)
  const setScreen = useUiStore((s) => s.setScreen)
  const tab = useUiStore((s) => s.detailsTab)
  const setTab = useUiStore((s) => s.setDetailsTab)
  const setSelectedGameId = useUiStore((s) => s.setSelectedGameId)
  const setHeroGameId = useUiStore((s) => s.setHeroGameId)
  const { data: entry, isLoading, error: loadError } = useLibraryEntry(selectedGameId)
  const { update, remove } = useLibraryActions()
  const { launch } = useGameActions()
  const steam = useSteamWindows()
  const activeSession = useSessionStore((s) => s.activeSession)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  useEffect(() => {
    if (!entry) return
    let attempts = 0
    let frame = 0
    const focusPlay = () => {
      if (document.querySelector('[data-screen="game-details"] [data-focused="true"]'))
        return
      if (focusManager.hasNode('details-play')) {
        focusManager.setFocus('details-play')
        return
      }
      if (++attempts < 30) frame = requestAnimationFrame(focusPlay)
    }
    frame = requestAnimationFrame(focusPlay)
    return () => cancelAnimationFrame(frame)
  }, [entry?.id])
  const goBack = () => {
    const target = backTarget('game-details', previousScreen)
    setScreen(target)
    focusManager.restoreFocus(focusRestoreId(target, entry?.id ?? selectedGameId))
  }
  if (isLoading || !entry)
    return (
      <section
        className={clsx(
          PAGE,
          'details-missing flex min-h-[60vh] flex-col items-center justify-center gap-4 p-10 text-center',
        )}
        data-theme="macos"
      >
        <Library size={32} className="text-white/[0.44]" />
        <h1 className="text-[25px]">
          {isLoading
            ? 'Loading your game…'
            : loadError
              ? 'Could not load this game'
              : 'Game not found'}
        </h1>
        <p className="text-white/[0.44]">
          {isLoading
            ? 'Getting everything ready.'
            : loadError
              ? 'Return to your library and try again.'
              : 'It may have been removed from your library.'}
        </p>
        {!isLoading && (
          <Focusable
            focusId="details-back-missing"
            group="details-actions"
            order={0}
            noScale
            className="details-secondary orbit-glass-control rounded-xl bg-white/10 px-[18px] py-3 text-[13px]"
            onClick={goBack}
          >
            Back to library
          </Focusable>
        )}
      </section>
    )
  const game = entry.game
  const about = isPlaceholderDescription(game.description) ? undefined : game.description
  const installation = selectInstallation(entry)
  const canSave = entryCanSave(entry)
  const installStatus = entryInstallStatus(entry)
  const running = Boolean(
    activeSession &&
    (activeSession.gameId === installation?.gameId || activeSession.gameId === game.id),
  )
  const error = update.error || remove.error || launch.error
  const refresh = async () => {
    setStatus(null)
    try {
      const result = await enrichGameMetadata(game.id)
      setStatus(result.message)
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err))
    }
  }
  const verify = async () => {
    if (!entry.steamAppId) return
    setStatus(null)
    try {
      await downloadSteamWindowsGame(entry.steamAppId)
      setStatus('Verification started.')
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err))
    }
  }
  const showFolder = async () => {
    if (!installation?.path) return
    setStatus(null)
    try {
      await revealPath(installation.path)
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err))
    }
  }
  return (
    <div className={PAGE} data-theme="macos">
      <DetailsHero game={game} eyebrow={EYEBROWS[installStatus]}>
        <DetailsPrimaryAction
          entry={entry}
          game={game}
          running={running}
          sessionId={activeSession?.id ?? null}
          signedIn={steam.status.data?.signedIn === true}
        />
        <Focusable
          focusId="details-favorite"
          group="details-actions"
          order={2}
          noScale
          disabled={update.isPending}
          aria-label={game.favorite ? 'Remove from favorites' : 'Add to favorites'}
          aria-pressed={game.favorite}
          onClick={() =>
            update.mutate({ id: entry.id, patch: { favorite: !game.favorite } })
          }
          className={clsx(
            'details-favorite orbit-glass-control backdrop-none flex min-h-12 items-center justify-center gap-[9px] rounded-full border-none bg-transparent px-5 text-xs text-white/[0.66]',
            'aria-pressed:text-[#ffc9db]',
            'max-[520px]:px-[15px] max-[520px]:[&_span]:hidden',
            'disabled:cursor-wait disabled:opacity-40',
          )}
        >
          <Heart size={18} fill={game.favorite ? 'currentColor' : 'none'} />
          <span>{game.favorite ? 'Favorited' : 'Favorite'}</span>
        </Focusable>
      </DetailsHero>
      <div className="details-content relative z-[1] mt-[-27px] px-[var(--console-gutter)] max-[520px]:px-[22px]">
        <MetaGrid game={game} />
        <TabList label="Game details" className="mb-6">
          {(['overview', 'settings'] as const).map((item, order) => (
            <Focusable
              key={item}
              role="tab"
              aria-selected={tab === item}
              aria-controls={`details-${item}`}
              focusId={`details-tab-${item}`}
              group="details-tabs"
              order={order}
              noScale
              noRing
              onClick={() => setTab(item)}
            >
              {item === 'overview' ? 'Overview' : 'Settings'}
            </Focusable>
          ))}
        </TabList>
        {tab === 'settings' && (
          <DetailsSettings entry={entry} game={game} canSave={canSave} />
        )}
        <div
          id="details-overview"
          role="tabpanel"
          aria-label="Overview"
          hidden={tab !== 'overview'}
        >
          {error && (
            <p
              role="alert"
              className="details-error orbit-glass-control mt-[22px] rounded-[14px] border border-[#fb718533] bg-[#fb718511] px-5 py-4 text-xs text-[#fda4af]"
            >
              {String(error)}
            </p>
          )}
          {status && (
            <p
              role="status"
              className="details-error orbit-glass-control mt-[22px] rounded-[14px] border border-[#fb718533] bg-[#fb718511] px-5 py-4 text-xs text-[#fda4af]"
            >
              {status}
            </p>
          )}
          <div
            className={clsx(
              'details-body-grid mt-9 grid grid-cols-[minmax(0,1fr)_300px] items-start gap-8',
              'min-[1700px]:grid-cols-[minmax(0,1fr)_340px]',
              'max-[1000px]:mt-7 max-[1000px]:gap-6',
              'min-[761px]:max-[1000px]:grid-cols-[minmax(0,1fr)_260px]',
              'max-[760px]:grid-cols-1',
            )}
          >
            <div className="details-main-column min-w-0">
              <section
                className="details-about orbit-glass rounded-3xl border border-white/[0.08] bg-white/[0.016] p-7 max-[520px]:p-[22px]"
                aria-labelledby="details-about-title"
              >
                <header className={SECTION_HEADING}>
                  <div>
                    <p className={EYEBROW}>THE WORLD AWAITS</p>
                    <h2 id="details-about-title" className={SECTION_TITLE}>
                      About this game
                    </h2>
                  </div>
                </header>
                {about ? (
                  <p className={DESCRIPTION}>{about}</p>
                ) : (
                  <div className="details-no-description">
                    <p className="text-[13px] text-white/[0.56]">
                      No description has been added yet.
                    </p>
                    <Focusable
                      focusId="details-add-description"
                      group="details-info"
                      order={0}
                      noScale
                      onClick={() => setTab('settings')}
                      className="details-inline-link mt-4 flex items-center gap-[7px] py-1 text-[11px] text-orbit-accent"
                    >
                      Add a description or fetch metadata
                      <ArrowUpRight size={14} />
                    </Focusable>
                  </div>
                )}
              </section>
              <DetailsRunInfo info={entry.runInfo} />
              <AchievementList key={game.id} achievements={game.achievements ?? []} />
            </div>
            <aside
              className={clsx(
                'details-library-panel orbit-glass sticky top-[18px] rounded-3xl border border-white/[0.125] bg-orbit-panel/40 px-6 py-[26px] shadow-[inset_0_1px_#ffffff0c,0_16px_40px_#0002]',
                'min-[1700px]:p-[30px]',
                'max-[1000px]:px-[18px] max-[1000px]:py-[22px]',
                'max-[760px]:static',
              )}
              aria-labelledby="details-library-title"
            >
              <header className={SECTION_HEADING}>
                <div>
                  <p className={EYEBROW}>MAKE IT YOURS</p>
                  <h2
                    id="details-library-title"
                    className="mt-[7px] text-[18px] font-[550] tracking-[-0.035em]"
                  >
                    In your library
                  </h2>
                </div>
                <Settings2 size={18} className="text-white/30" />
              </header>
              <InstallationPicker entry={entry} />
              <dl
                className={clsx(
                  'details-library-facts grid gap-[15px] border-b border-white/[0.06] pb-6 text-[11px]',
                  'max-[520px]:gap-3',
                  '[&>div]:flex [&>div]:justify-between [&>div]:gap-[18px]',
                  '[&_dt]:text-white/40',
                  '[&_dd]:text-right [&_dd]:text-white/[0.78]',
                )}
              >
                <div>
                  <dt>Source</dt>
                  <dd>{providerLabel(game.provider)}</dd>
                </div>
                <div>
                  <dt>Added</dt>
                  <dd>{formatRelativeDate(game.dateAdded)}</dd>
                </div>
                <div>
                  <dt>Visibility</dt>
                  <dd>{game.hidden ? 'Hidden' : 'In library'}</dd>
                </div>
              </dl>
              <div
                className={clsx(
                  'details-management -mx-2.5 -mb-2 mt-3.5 grid gap-1',
                  'min-[521px]:max-[760px]:grid-cols-2',
                  'max-[520px]:grid-cols-1',
                  '[&_button]:flex [&_button]:w-full [&_button]:items-center [&_button]:gap-3 [&_button]:rounded-[10px] [&_button]:px-2.5 [&_button]:py-[13px] [&_button]:text-left [&_button]:text-white/[0.69]',
                  '[&_button>svg]:shrink-0',
                  '[&_button>span]:text-[11px]',
                  '[&_small]:mt-1 [&_small]:block [&_small]:text-[9px] [&_small]:leading-[1.7] [&_small]:opacity-60',
                  '[&_button:hover]:bg-white/[0.035]',
                )}
              >
                <Focusable
                  focusId="details-edit"
                  group="details-management"
                  order={0}
                  noScale
                  onClick={() => setTab('settings')}
                >
                  <Settings2 size={16} />
                  <span>
                    Edit properties<small>Artwork, metadata & launch settings</small>
                  </span>
                  <ArrowUpRight size={14} className="ml-auto opacity-40" />
                </Focusable>
                {canSave && (
                  <Focusable
                    focusId="details-refresh"
                    group="details-management"
                    order={1}
                    noScale
                    onClick={() => void refresh()}
                  >
                    <RefreshCw size={16} />
                    <span>
                      Refresh metadata<small>Keep Steam copy and artwork current</small>
                    </span>
                  </Focusable>
                )}
                {installation?.path && (
                  <Focusable
                    focusId="details-show-folder"
                    group="details-management"
                    order={2}
                    noScale
                    onClick={() => void showFolder()}
                  >
                    <FolderOpen size={16} />
                    <span>
                      Show folder<small>Reveal the installation on disk</small>
                    </span>
                  </Focusable>
                )}
                {isOrbitManagedDownload(installation?.path) && entry.steamAppId && (
                  <Focusable
                    focusId="details-verify"
                    group="details-management"
                    order={3}
                    noScale
                    onClick={() => void verify()}
                  >
                    <RefreshCw size={16} />
                    <span>
                      Verify files<small>Re-check the Orbit-managed download</small>
                    </span>
                  </Focusable>
                )}
                <Focusable
                  focusId="details-hide"
                  group="details-management"
                  order={4}
                  noScale
                  disabled={update.isPending}
                  onClick={() =>
                    update.mutate({ id: entry.id, patch: { hidden: !game.hidden } })
                  }
                  className="disabled:cursor-wait disabled:opacity-40"
                >
                  {game.hidden ? <Eye size={16} /> : <EyeOff size={16} />}
                  <span>
                    {game.hidden ? 'Show in library' : 'Hide from library'}
                    <small>
                      {game.hidden
                        ? 'Return to your collection'
                        : 'Keep the game, clear the clutter'}
                    </small>
                  </span>
                </Focusable>
                <Focusable
                  focusId="details-delete"
                  group="details-management"
                  order={5}
                  noScale
                  disabled={running || remove.isPending}
                  onClick={() => setConfirmDelete(true)}
                  className="details-remove col-span-full text-[#f3a5b9] disabled:cursor-wait disabled:opacity-40 max-[760px]:col-span-full"
                >
                  <Trash2 size={16} />
                  <span>
                    Remove from Orbit
                    <small>
                      {running
                        ? 'End your session first'
                        : 'Installed game files stay untouched'}
                    </small>
                  </span>
                </Focusable>
              </div>
            </aside>
          </div>
        </div>
      </div>
      <ConfirmDialog
        open={confirmDelete}
        title={`Remove ${game.title} from Orbit?`}
        description="This removes the game and its Orbit play history. Your installed game files stay untouched, and you can import the game again later."
        confirmLabel="Remove game"
        busy={remove.isPending}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() =>
          remove.mutate(entry.id, {
            onSuccess: () => {
              setConfirmDelete(false)
              setSelectedGameId(null)
              setHeroGameId(null)
              setScreen('library')
            },
            onError: () => setConfirmDelete(false),
          })
        }
      />
    </div>
  )
}

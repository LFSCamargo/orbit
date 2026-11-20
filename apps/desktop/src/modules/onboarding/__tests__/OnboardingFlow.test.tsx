import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  cleanup,
  configure,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DEFAULT_APP_PREFERENCES, saveAppPreferences } from '@/lib/appPreferences'
import { useDownloadStore } from '@/lib/downloadProgress'
import {
  getCompatibilityCatalog,
  getComponentStatus,
  installComponent,
  installOrbitWine,
  listLibraryEntries,
  scanNativeApps,
  updateCompatibilitySettings,
  orbitWineStatus,
} from '@/lib/tauri'
import { usePreferencesStore } from '@/stores/preferences.store'
import { useUiStore } from '@/stores/ui.store'
import type { LibraryEntry } from '@/types/library'
import { OnboardingFlow } from '../OnboardingFlow'

// Each test walks several steps; under a full parallel run the default 1 s
// wait per step is too tight.
configure({ asyncUtilTimeout: 4000 })
// jsdom never loads images, so their decode would only end at the preload's cap.
HTMLImageElement.prototype.decode = () => Promise.resolve()
vi.setConfig({ testTimeout: 20_000 })

vi.mock('@/lib/appPreferences', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/appPreferences')>()),
  saveAppPreferences: vi.fn(),
}))

vi.mock('@/lib/tauri', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/tauri')>()),
  getCompatibilityCatalog: vi.fn(),
  getComponentStatus: vi.fn(),
  orbitWineStatus: vi.fn(),
  installOrbitWine: vi.fn(),
  installComponent: vi.fn(),
  updateCompatibilitySettings: vi.fn(),
  scanNativeApps: vi.fn(),
  listLibraryEntries: vi.fn(),
}))

const version = (tag: string) => ({
  version: tag,
  prerelease: false,
  asset: { name: tag, url: `https://x/${tag}`, size: 100, sha256: null },
  homebrewFormula: null,
  localPackage: null,
})

const game = (id: string, platform: string): LibraryEntry =>
  ({
    id,
    steamAppId: id.split(':')[1] ?? null,
    owned: true,
    preferredInstallationId: null,
    installations: [],
    game: { id, title: `Game ${id}`, provider: 'steam', platform, artwork: {} },
  }) as unknown as LibraryEntry

let gptkAttempts = 0

beforeEach(() => {
  gptkAttempts = 0
  useDownloadStore.setState({ tasks: {}, failures: {} })
  useUiStore.setState({ onboardingOpen: false, screen: 'home' })
  usePreferencesStore.setState({
    ready: true,
    preferences: { ...DEFAULT_APP_PREFERENCES },
  })
  vi.mocked(saveAppPreferences).mockReset().mockResolvedValue(undefined)
  vi.mocked(getCompatibilityCatalog).mockResolvedValue({
    fetchedAt: '',
    warnings: [],
    components: ['gptk', 'dxmt', 'dxvk', 'moltenvk'].map((id) => ({
      id,
      name: id,
      technology: '',
      sourceUrl: '',
      distribution: '',
      downloadable: true,
      versions: [version(`${id}-1`)],
    })),
  })
  vi.mocked(getComponentStatus).mockResolvedValue([])
  vi.mocked(orbitWineStatus).mockResolvedValue(null)
  vi.mocked(installOrbitWine).mockImplementation(async (onProgress) => {
    onProgress({
      phase: 'Downloading',
      component: 'Orbit Wine 26.3.0',
      downloadedBytes: 5,
      totalBytes: 10,
    })
    return undefined as never
  })
  vi.mocked(installComponent).mockImplementation(async (spec) => {
    if (spec.id === 'gptk' && gptkAttempts++ === 0) throw new Error('checksum mismatch')
    return undefined as never
  })
  vi.mocked(updateCompatibilitySettings).mockImplementation(async (s) => s)
  vi.mocked(scanNativeApps).mockResolvedValue({
    imported: 1,
    enriched: 0,
    provider: 'native',
  })
  vi.mocked(listLibraryEntries).mockResolvedValue({
    entries: [
      game('steam:10', 'windows'),
      game('steam:20', 'windows'),
      game('steam:30', 'macos'),
    ],
    total: 3,
    nextCursor: null,
  })
})

afterEach(cleanup)

function renderFlow() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <OnboardingFlow />
    </QueryClientProvider>,
  )
}

const primary = () =>
  screen.getByRole('button', {
    name: /Get Started|Download|Continue|Retry|Start Scan|Finish|Checking/,
  })

it('guides a new user from Welcome to Home', async () => {
  renderFlow()
  expect(screen.getByRole('heading', { name: 'Welcome to Orbit' })).toBeInTheDocument()
  expect(screen.getByRole('listitem', { current: 'step' })).toHaveTextContent('Welcome')
  fireEvent.click(screen.getByRole('button', { name: /Get Started/ }))

  // Setup: recommended rows are checked, the optional one is not, and the
  // required Wine row cannot be unchecked.
  await screen.findByRole('heading', { name: 'Setup' })
  await screen.findByRole('checkbox', { name: 'Install DXVK + MoltenVK' })
  for (const name of [
    'Install Orbit Wine',
    'Install Game Porting Toolkit',
    'Install DXMT',
  ]) {
    expect(screen.getByRole('checkbox', { name })).toHaveAttribute('aria-checked', 'true')
  }
  const optional = screen.getByRole('checkbox', { name: 'Install DXVK + MoltenVK' })
  expect(optional).toHaveAttribute('aria-checked', 'false')
  const wine = screen.getByRole('checkbox', { name: 'Install Orbit Wine' })
  fireEvent.click(wine)
  expect(wine).toHaveAttribute('aria-checked', 'true')
  fireEvent.click(screen.getByRole('button', { name: /Download & Continue/ }))

  // GPTK fails once: the rest still install, then only GPTK is retried.
  await screen.findByRole('heading', { name: 'Setup needs attention' })
  expect(screen.getByText('2 of 3 components completed successfully')).toBeInTheDocument()
  expect(screen.getByText(/checksum mismatch/)).toBeInTheDocument()
  expect(installComponent).not.toHaveBeenCalledWith(
    expect.objectContaining({ id: 'dxvk' }),
    expect.any(Function),
  )
  fireEvent.click(screen.getByRole('button', { name: /Retry Download/ }))
  await screen.findByRole('heading', { name: 'Setup complete' })
  expect(installOrbitWine).toHaveBeenCalledTimes(1)
  fireEvent.click(primary())

  // Account: skip to the local-first screen, then continue.
  await screen.findByRole('heading', { name: 'Account' })
  expect(screen.getByRole('button', { name: /Epic Games: coming soon/ })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }))
  await screen.findByRole('heading', { name: 'Continue without an account' })
  fireEvent.click(primary())

  // Recommended: turn scanning on startup off and save.
  await screen.findByRole('heading', { name: 'Recommended Settings' })
  fireEvent.click(
    await screen.findByRole('switch', { name: 'Scan for new games on startup' }),
  )
  fireEvent.click(primary())
  await screen.findByRole('heading', { name: 'Scan Games' })
  expect(usePreferencesStore.getState().preferences.scanOnStartup).toBe(false)
  expect(updateCompatibilitySettings).toHaveBeenCalledWith(
    expect.objectContaining({ synchronization: 'msync', avx: true, graphics: 'auto' }),
  )

  // Scan: counts by source and shows the found games' artwork.
  fireEvent.click(screen.getByRole('button', { name: /Start Scan/ }))
  await screen.findByRole('heading', { name: 'Scan complete' })
  expect(screen.getByText('3 games found')).toBeInTheDocument()
  expect(screen.getByText('Steam · Windows · 2 games')).toBeInTheDocument()
  expect(document.querySelectorAll('.cover-fan .progressive-artwork')).toHaveLength(3)

  fireEvent.click(screen.getByRole('button', { name: /Finish Setup/ }))
  await waitFor(() =>
    expect(usePreferencesStore.getState().preferences.onboardingCompleted).toBe(true),
  )
  expect(useUiStore.getState().screen).toBe('home')
})

it('shows the empty state when no games are found', async () => {
  vi.mocked(listLibraryEntries).mockResolvedValue({
    entries: [],
    total: 0,
    nextCursor: null,
  })
  vi.mocked(getComponentStatus).mockResolvedValue(
    ['gptk', 'dxmt', 'dxvk', 'moltenvk'].map((id) => ({
      id,
      version: `${id}-1`,
      kind: 'dxmt' as const,
      path: '',
      installedAt: '',
    })),
  )
  vi.mocked(orbitWineStatus).mockResolvedValue({
    version: '26.3.0',
    path: '/orbit-wine/wine',
    containerReady: true,
  })
  renderFlow()
  fireEvent.click(screen.getByRole('button', { name: /Get Started/ }))
  // Everything is installed already: Setup just continues.
  await screen.findByRole('heading', { name: 'Setup' })
  await waitFor(() => expect(primary()).toHaveTextContent('Continue'))
  for (const row of screen.getAllByRole('checkbox')) {
    expect(row).toHaveAttribute('aria-checked', 'true')
    expect(row).toHaveAttribute('aria-disabled', 'true')
  }
  fireEvent.click(primary())
  await screen.findByRole('heading', { name: 'Account' })
  fireEvent.click(primary())
  await screen.findByRole('heading', { name: 'Recommended Settings' })
  fireEvent.click(primary())
  await screen.findByRole('heading', { name: 'Scan Games' })
  fireEvent.click(primary())
  await screen.findByRole('heading', { name: 'No games found' })
  expect(screen.getByRole('button', { name: 'Add another path' })).toBeInTheDocument()
  expect(primary()).toHaveTextContent('Finish Anyway')
})

it('asks before skipping setup, then opens Home', async () => {
  useUiStore.setState({ screen: 'settings' })
  renderFlow()
  fireEvent.click(screen.getByRole('button', { name: 'Skip setup' }))
  await screen.findByRole('heading', { name: 'Skip setup?' })
  expect(usePreferencesStore.getState().preferences.onboardingCompleted).toBe(false)
  const [, confirm] = screen.getAllByRole('button', { name: 'Skip setup' })
  fireEvent.click(confirm)
  await waitFor(() =>
    expect(usePreferencesStore.getState().preferences.onboardingCompleted).toBe(true),
  )
  expect(useUiStore.getState().screen).toBe('home')
})

it('puts focus on the primary action of each new step', async () => {
  const { focusManager } = await import('@/controllers/FocusManager')
  renderFlow()
  fireEvent.click(screen.getByRole('button', { name: /Get Started/ }))
  await screen.findByRole('heading', { name: 'Setup' })
  await waitFor(() =>
    expect(focusManager.getFocusedNode()?.id).toBe('onboarding-primary'),
  )
  expect(focusManager.getFocusedNode()?.element).toHaveTextContent(/Download|Continue/)
})

it('signs in to Xbox with a device code instead of opening a window', async () => {
  const tauri = await import('@/lib/tauri')
  const open = vi.spyOn(tauri, 'openXboxCloud')
  vi.spyOn(tauri, 'xboxAccountStatus').mockResolvedValue(null)
  vi.spyOn(tauri, 'xboxDeviceStart').mockResolvedValue({
    userCode: 'ORBIT123',
    verificationUri: 'https://www.microsoft.com/link',
    intervalSeconds: 5,
    expiresInSeconds: 900,
  })
  vi.spyOn(tauri, 'xboxDevicePoll').mockResolvedValue({ done: false, account: null })
  vi.mocked(getComponentStatus).mockResolvedValue(
    ['gptk', 'dxmt', 'dxvk', 'moltenvk'].map((id) => ({
      id,
      version: `${id}-1`,
      kind: 'dxmt' as const,
      path: '',
      installedAt: '',
    })),
  )
  vi.mocked(orbitWineStatus).mockResolvedValue({
    version: '26.3.0',
    path: '/orbit-wine/wine',
    containerReady: true,
  })
  renderFlow()
  fireEvent.click(screen.getByRole('button', { name: /Get Started/ }))
  await screen.findByRole('heading', { name: 'Setup' })
  await waitFor(() => expect(primary()).toHaveTextContent('Continue'))
  fireEvent.click(primary())
  const xbox = await screen.findByRole('button', { name: /Xbox Cloud Gaming/ })
  fireEvent.click(xbox)
  expect(await screen.findByLabelText('Sign-in code')).toHaveTextContent('ORBIT123')
  expect(open).not.toHaveBeenCalled()
})

it('hands focus back to the primary action when a wait ends', async () => {
  const { focusManager } = await import('@/controllers/FocusManager')
  vi.mocked(getComponentStatus).mockResolvedValue(
    ['gptk', 'dxmt', 'dxvk', 'moltenvk'].map((id) => ({
      id,
      version: `${id}-1`,
      kind: 'dxmt' as const,
      path: '',
      installedAt: '',
    })),
  )
  vi.mocked(orbitWineStatus).mockResolvedValue({
    version: '26.3.0',
    path: '/orbit-wine/wine',
    containerReady: true,
  })
  renderFlow()
  fireEvent.click(screen.getByRole('button', { name: /Get Started/ }))
  await screen.findByRole('heading', { name: 'Setup' })
  await waitFor(() => expect(primary()).toHaveTextContent('Continue'))
  fireEvent.click(primary())
  await screen.findByRole('heading', { name: 'Account' })
  fireEvent.click(primary())
  await screen.findByRole('heading', { name: 'Recommended Settings' })
  fireEvent.click(primary())
  await screen.findByRole('heading', { name: 'Scan Games' })
  fireEvent.click(primary())
  // The busy, disabled primary sends focus to Back; it returns afterwards.
  focusManager.setFocus('onboarding-back')
  await screen.findByRole('heading', { name: 'Scan complete' })
  await waitFor(() =>
    expect(focusManager.getFocusedNode()?.id).toBe('onboarding-primary'),
  )
})

it('keeps the opening focus on Get Started even if Orbit behind claims it', async () => {
  const { focusManager } = await import('@/controllers/FocusManager')
  renderFlow()
  // Orbit's own screen mounting behind the overlay drops the trap and focus.
  focusManager.setGroupPreference(null, { trap: false })
  focusManager.setFocus('onboarding-minimize')
  await waitFor(
    () => expect(focusManager.getFocusedNode()?.id).toBe('onboarding-primary'),
    { timeout: 1500 },
  )
  expect(focusManager.getFocusedNode()?.element).toHaveTextContent('Get Started')
})

it('draws no dark ring offset around focused onboarding controls', async () => {
  const { focusManager } = await import('@/controllers/FocusManager')
  renderFlow()
  await waitFor(() =>
    expect(focusManager.getFocusedNode()?.id).toBe('onboarding-primary'),
  )
  for (const control of document.querySelectorAll('.onboarding [data-focus-id]')) {
    expect(control.className).not.toMatch(/ring-offset/)
  }
  focusManager.setFocus('onboarding-minimize')
  expect(screen.getByRole('button', { name: 'Minimize Orbit' }).className).not.toMatch(
    /ring-offset/,
  )
})

it('waits for the component check before listing rows or offering Continue', async () => {
  let release: (
    value: Awaited<ReturnType<typeof getCompatibilityCatalog>>,
  ) => void = () => {}
  const catalog = await getCompatibilityCatalog()
  vi.mocked(getCompatibilityCatalog).mockReturnValue(
    new Promise((resolve) => {
      release = resolve
    }),
  )
  renderFlow()
  fireEvent.click(screen.getByRole('button', { name: /Get Started/ }))
  await screen.findByRole('heading', { name: 'Setup' })
  // Regression: rows showed unchecked/unavailable and a disabled "Continue"
  // until the catalog arrived.
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  // A spinner on the real label, not "Checking…" text, and shimmer rows.
  expect(primary()).toHaveTextContent('Continue')
  expect(primary().querySelector('[data-busy="true"]')).not.toBeNull()
  expect(primary()).toBeDisabled()
  expect(
    screen.getByRole('status', { name: 'Checking your components' }),
  ).toHaveTextContent('')
  release(catalog)
  await waitFor(() =>
    expect(screen.getByRole('checkbox', { name: 'Install DXMT' })).toHaveAttribute(
      'aria-checked',
      'true',
    ),
  )
  expect(primary()).toHaveTextContent('Download & Continue')
})

it('shows the card only once Setup data and the scene are ready, with a spinner meanwhile', async () => {
  let release: (
    value: Awaited<ReturnType<typeof getCompatibilityCatalog>>,
  ) => void = () => {}
  const catalog = await getCompatibilityCatalog()
  vi.mocked(getCompatibilityCatalog).mockReturnValue(
    new Promise((resolve) => {
      release = resolve
    }),
  )
  renderFlow()
  const card = document.querySelector('.onboarding-card') as HTMLElement
  expect(card).toHaveAttribute('data-ready', 'false')
  expect(card).toHaveAttribute('inert')
  const waiting = screen.getByRole('status', { name: 'Preparing setup' })
  expect(waiting.textContent).toBe('')
  release(catalog)
  await waitFor(() => expect(card).toHaveAttribute('data-ready', 'true'))
  expect(card).not.toHaveAttribute('inert')
  expect(screen.queryByRole('status', { name: 'Preparing setup' })).toBeNull()
})

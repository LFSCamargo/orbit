import { useState } from 'react'
import { runtimeDiagnostics } from '@/lib/tauri'
import { Focusable } from '@/components/focus/Focusable'
export function RuntimeDiagnostics({ gameId }: { gameId: string }) {
  const [log, setLog] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const load = async () => {
    setBusy(true)
    try {
      setLog(await runtimeDiagnostics(gameId))
    } catch (error) {
      setLog(String(error))
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="orbit-panel my-4 rounded-card p-5">
      <h2 className="text-lg font-semibold">Windows compatibility</h2>
      <p className="my-2 text-sm text-orbit-muted">
        A dedicated Wine environment is prepared on first Play. Configure the runtime and
        arguments above.
      </p>
      <Focusable
        focusId="runtime-diagnostics"
        group="details-actions"
        order={12}
        disabled={busy}
        onClick={() => void load()}
        className="orbit-glass-control rounded-card px-4 py-2 disabled:cursor-wait disabled:opacity-40"
      >
        {busy ? 'Reading…' : 'Compatibility diagnostics'}
      </Focusable>
      {log !== null && (
        <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-all text-xs">
          {log || 'No runtime errors logged.'}
        </pre>
      )}
    </section>
  )
}

import { useState } from 'react'
import { TabList } from '@/components/ui/tab-list'
import { Focusable } from '@/components/focus/Focusable'
import { GameSettingsPanel } from './GameSettingsPanel'
import { GameMetadataEditor } from './GameMetadataEditor'
import { InstallationPicker } from './InstallationPicker'
import type { Game } from '@/types/game'
import type { LibraryEntry } from '@/types/library'

const SECTIONS = [
  { id: 'general', label: 'General' },
  { id: 'artwork', label: 'Artwork' },
  { id: 'launch', label: 'Launch & Compatibility' },
] as const

export function DetailsSettings({
  entry,
  game,
  canSave,
}: {
  entry: LibraryEntry
  game: Game
  canSave: boolean
}) {
  const [section, setSection] = useState<(typeof SECTIONS)[number]['id']>('general')
  return (
    <div id="details-settings" role="tabpanel" aria-label="Settings">
      <TabList label="Properties" className="mb-6">
        {SECTIONS.map((item, order) => (
          <Focusable
            key={item.id}
            role="tab"
            aria-selected={section === item.id}
            focusId={`properties-tab-${item.id === 'general' ? 'metadata' : item.id}`}
            group="properties-tabs"
            order={order}
            noScale
            noRing
            onClick={() => setSection(item.id)}
          >
            {item.label}
          </Focusable>
        ))}
      </TabList>
      <div hidden={section === 'launch'}>
        <GameMetadataEditor
          key={game.id}
          game={game}
          section={section === 'launch' ? 'general' : section}
          canSave={canSave}
        />
      </div>
      {section === 'launch' &&
        (canSave ? (
          <>
            <InstallationPicker entry={entry} />
            <GameSettingsPanel key={game.id} game={game} />
          </>
        ) : (
          <p className="text-orbit-muted">Install this game to edit launch settings.</p>
        ))}
    </div>
  )
}

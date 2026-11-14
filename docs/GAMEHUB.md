# GameHub in Orbit

GameHub is not a provider integration. Orbit does not scan GameHub shortcuts, open
`gamehub://` deep links, or read GameHub’s download queue.

Existing Steam installations that happen to live in a GameHub `steamapps/common`
folder are discovered the same way as any other Steam library root: add the folder
in **Settings → Library**. Discovery does not require GameHub to be
installed, signed in, or running.

Legacy Steam-linked Windows records migrate to Steam. Unmatched GameHub rows leave
the active library only after a SQLite backup. Installed files are never moved or
deleted. See the unified library redesign in [DESIGN_DOC.mdc](DESIGN_DOC.mdc) and
Windows Steam in [STEAM_WINDOWS.md](STEAM_WINDOWS.md).

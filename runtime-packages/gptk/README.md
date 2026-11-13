# Apple GPTK package mirrors

These four DMGs were supplied from the maintainer's local Apple downloads for
Orbit's checksum-verified compatibility catalog. They are source packages for the
app's download manager, **not** Tauri bundle resources; release builds must not
accidentally embed them a second time.

- `Game_Porting_Toolkit_*.dmg`: complete toolkit with documentation and samples.
- `Evaluation_environment_for_Windows_games_*.dmg`: smaller runtime payload with
  `redist/lib`, which is the payload Orbit's graphics integration should consume.

Apple's `License.rtf`, `Acknowledgements.rtf`, and `Read Me.rtf` are preserved
under `licenses/` for each evaluation payload. Use and redistribution are governed
by those Apple terms; review them before publishing mirrors or using them in a
commercial distribution.

## Fetch with curl

From the repository root:

```bash
scripts/fetch-gptk.sh 4.0-beta-3-evaluation
scripts/fetch-gptk.sh 3.0-evaluation /path/to/output
```

The script downloads from the `baseUrl` in `manifest.json`, rejects size or
SHA-256 mismatches, and writes only after verification. The default output is the
ignored `release/gptk/` directory. Raw GitHub URLs work after the package files
are committed and pushed to `main`.

For a local integrity test without network access:

```bash
ORBIT_GPTK_BASE_URL="file://$PWD/runtime-packages/gptk" \
  scripts/fetch-gptk.sh 4.0-beta-3-evaluation /tmp/orbit-gptk-test
```

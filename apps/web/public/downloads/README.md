# Desktop installers

Place release binaries here before deploying the web app. They are served as static files at:

- `/downloads/VaultChat.dmg` — macOS
- `/downloads/VaultChat-Setup.exe` — Windows

## How to add builds

1. Download artifacts from the **Desktop release** GitHub Action (or build locally).
2. Rename/copy into this folder with the exact filenames above.
3. Update `manifest.json` `version` / `updatedAt` if you want the download page to show a new release label.
4. Commit the binaries (or include them in your deploy upload) and deploy the web app so these files ship with `public/`.

## Safety

There is no public upload API. Only operators who can write to this folder (or the deploy pipeline) can change installers. Users download over HTTPS from the same origin.

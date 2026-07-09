# Recovery photos

Place approved recovery images in a folder named after the story id, e.g.:

```
public/recoveries/tv-moshupa-2026-03/
  01-tv-mounted-recovered.jpg
  02-recovery-team-indoor.jpg
  ...
```

## Naming convention

- Folder name = story `id` from `src/data/recoveries.js`
- Files = `NN-short-description.jpg` (two-digit order, kebab-case)
- List filenames in the story’s `photos` array (via `storyPhotos()` helper)

## Before publishing

- Blur faces
- Blur vehicle registration plates
- Blur house numbers, business signs and other identifying details
- Get client consent for publication

## Re-organising new uploads

If you drop photos into a temporary folder, run:

```bash
npm install --no-save sharp
node scripts/organize-recovery-photos.mjs
```

(Update the script’s `moves` list first.)

# P11 — Image Studio Asset Picker

## Scope
- Allow Image Studio to browse locally stored Asset Library metadata.
- Load an image Blob only after the user explicitly selects an asset.
- Convert the selected stored Blob into a browser File and reuse the existing Image Studio input validation and preview flow.
- Keep provider credentials and image bytes out of execution-history metadata.

## Behavior
- The picker lists metadata from `listAssets()`; it does not eagerly load image Blobs or create thumbnails.
- Selecting an asset loads it with `getAsset()`, then checks the existing 10 MB Image Studio input limit.
- Missing assets and storage errors are surfaced to the user.
- Users can still upload a new reference image as before.

## Validation
- CI must pass TypeScript, unit tests, browser acceptance, production build, and Gateway tests before merge.

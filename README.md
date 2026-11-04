# SqueekChain: Testnet Simulator & Kinetic Benchmark (Demo Mode)

An educational, client-side WHEELY9000 hamster-wheel benchmark. All $SQK values are simulated points. **No real or testnet cryptocurrency is transferred.** For official testnet tokens, visit [sepolia.squeekchain.com](https://sepolia.squeekchain.com).

The existing vanilla HTML/CSS/JavaScript stack, neon green/gold palette, canvas hamster, missions, character concepts and fictional origin story are retained. The site now starts at zero, describes its illustrative data honestly, and records a real local score snapshot instead of presenting a claim or transfer flow.

## Install, preview and rebuild

Node.js 22 or newer is sufficient. The site has **no runtime dependencies**, backend, API keys, RPC service, or remote font requirements. Nothing needs installing to rebuild or preview:

```sh
node scripts/build.mjs
node scripts/preview.mjs
```

Open `http://127.0.0.1:4173/preview/`. Stop the preview with Ctrl+C. An optional port can be passed as `node scripts/preview.mjs 8080`.

`dist/index.html`, `dist/app.js`, `dist/wallet.js`, `dist/styles.css` and `dist/assets/` are the complete production export. Serve the contents of `dist/` at any static hosting subpath. Asset references are relative; navigation uses in-page hashes. Rebuild after changing source. No publication or on-chain deployment is performed by these scripts.

## Use the demo

- Select **Spin wheel**, use Enter/Space on that button, or hold Space with the page body focused.
- **Start auto turbo** runs the benchmark; **Pause auto turbo** stops both wheel speed and score accumulation. Hiding the tab also pauses the session. Sound starts off and requires explicit opt-in.
- **Record Simulation Score (Demo)** saves the latest points, revolutions, peak RPM, simulated block count and local timestamp to this browser. It replaces the previous record, keeps the current session running, and never requires a wallet. Browser storage failures are reported as a record for this tab only. Reset clears the session and missions while preserving the last record.
- Each revolution adds 0.5 demo points. Every 120 revolutions completes a simulated block. The displayed hashrate is RPM × 1.85, an illustrative calculation rather than cryptographic work.
- Aura missions are local demo progress. Character traits and allocation figures are explicitly illustrative. There is no global rank, verified whitelist, minted NFT, or token entitlement in this tool. The X link only opens an optional draft and awards nothing.

The optional **Connect wallet** control opens a read-only spectator dialog. EIP-6963 lists named browser wallets, with a legacy browser-provider fallback. Supported phone links open the same page in MetaMask, Coinbase Wallet or Phantom. The sole provider request is `eth_requestAccounts`; the site displays the selected address and handles account changes and local disconnection. It never signs, sends, switches networks, reads token balances, or couples a score to an address. Disconnecting forgets the address on this page; it does not revoke permissions in the wallet. There is no relay, WalletConnect project, passkey-wallet creation or automatic reconnection.

## Locked development tools and checks

`tooling/package.json` and `tooling/package-lock.json` pin TypeScript 5.9.3, Playwright 1.64.1 and axe-core's Playwright adapter 4.14.0. They are new, separate tooling; no existing dependency or build configuration was replaced.

To keep dependency directories outside the checkout, install the locked tools in a temporary folder. Run these commands in the same shell/session:

```sh
mkdir -p /tmp/squeekchain-tooling
cp tooling/package.json tooling/package-lock.json /tmp/squeekchain-tooling/
npm ci --prefix /tmp/squeekchain-tooling --ignore-scripts
node /tmp/squeekchain-tooling/node_modules/typescript/bin/tsc --project jsconfig.json
PLAYWRIGHT_BROWSERS_PATH=/tmp/squeekchain-browsers node /tmp/squeekchain-tooling/node_modules/playwright/cli.js install chromium-headless-shell
node scripts/build.mjs
TMPDIR=/tmp PLAYWRIGHT_BROWSERS_PATH=/tmp/squeekchain-browsers SQUEEK_TOOLING_DIR=/tmp/squeekchain-tooling/node_modules node scripts/validate.mjs
```

Alternatively, in an ordinary local development checkout, `npm ci --prefix tooling`, `npm --prefix tooling run typecheck`, `npm --prefix tooling run build`, and `npm --prefix tooling run validate` use the same scripts. Install Playwright's headless Chromium first. Generated dependency directories are not deliverables.

Validation starts and closes its own foreground static server under `/preview/`, checks the actual production export, and writes `docs/validation/interaction-results.json` and screenshots. It covers source/export equality, the local share image, 320/390/768/1440 layouts, the complete guest benchmark, persistence and storage failures, missions, keyboard actions, modal focus, reduced motion, EIP-6963 and legacy provider fixtures, phone-link construction, text enlargement, RTL reflow, resource errors and operation with external services blocked. Virtual browser time advances long benchmark sessions; it does not wait for them in real time. No external posts or transactions are sent.

For an optional WebKit smoke check, install Playwright WebKit and its system libraries, then run the same validation with `SQUEEK_WEBKIT=1`. `SQUEEK_CHROMIUM` can select a compatible preinstalled Chromium executable.

## Results from this assignment

- Production build: passed; export is 214,604 bytes with all required runtime assets.
- Strict typecheck: passed (`checkJs`, `strict`, `noEmit` for `app.js` and `wallet.js`).
- Interaction validation: 12 checks passed, zero failed in the final Chromium run. axe reported zero violations for the tested WCAG A/AA rules on desktop, mobile and the spectator dialog. This is not a claim of complete accessibility conformance.
- Pinned taste@1 probe: **15/16 passed**, run against `dist/` with `--offline`. The sole flag is the exact required uppercase `TESTNET SIMULATION:` banner. Its casing is intentionally preserved. No overflow, overlapping text, missing assets or measured text-contrast failures remained. At 390×844 the Spin button ends near 612px and the Record button near 701px, both within the first screen.
- The supplied browser tool failed to launch because its temporary socket path was too long. Foreground Playwright using headless Chromium completed the rendered checks and screenshots. A separate WebKit attempt failed before page load because required system libraries were missing; WebKit behavior remains unverified. No real wallet extension, phone app, physical device, screen reader, native browser zoom or social-crawler unfurl was tested.

See [DESIGN.md](DESIGN.md) for the implemented system and [docs/VALIDATION.md](docs/VALIDATION.md) for all six Better Interface domains, source locations, fixes, evidence and remaining limits. These are worker observations, not independent certification.

## Assets and attribution

Font files are bundled in `assets/fonts/` with their SIL Open Font Licenses. The favicon derives from the existing hamster artwork. `assets/social-card.svg` is the editable source for the bundled 1200×630 PNG share card; neither asset requires a remote service at runtime.

Design review used the supplied Better Interface guide by Jakub Krehel (MIT, commit `267330e1adfc66a718fb65fa6918c1f06d0a689e`) and documentation guidance adapted from Paul Bakaus's Impeccable (Apache-2.0, commit `9d715cc4f5564a990ca8345abfdd5df6dc9b41c8`). The design documentation describes the final implementation rather than reproducing the guides.

// Optional spectator connection. This module is independent of benchmark/score state.
// The sole RPC method is the account-access request; no signing or transaction API exists here.
/** @typedef {{request: (args: {method: string}) => Promise<unknown>, on?: (event: string, handler: (...args: unknown[]) => void) => void, removeListener?: (event: string, handler: (...args: unknown[]) => void) => void}} Provider */
/** @typedef {{uuid: string, name: string, icon?: string, provider: Provider}} Wallet */

/** @template {HTMLElement} T @param {string} id @param {new () => T} type @returns {T} */
function element(id, type) {
  const node = document.getElementById(id);
  if (!(node instanceof type)) throw new Error(`Missing ${id}`);
  return node;
}
/** @param {(text: string) => void} log */
export function setupWallet(log) {
  const trigger = element('connect-wallet-btn', HTMLButtonElement);
  const triggerText = trigger.querySelector('.wallet-text');
  if (!(triggerText instanceof HTMLElement)) return;
  const text = triggerText;
  const dialog = element('wallet-dialog', HTMLDialogElement);
  const options = element('wallet-options', HTMLDivElement);
  const current = element('wallet-current', HTMLParagraphElement);
  const status = element('wallet-status', HTMLParagraphElement);
  const disconnectBtn = element('wallet-disconnect', HTMLButtonElement);
  /** @type {Map<string, Wallet>} */
  const discovered = new Map();
  /** @type {Provider | null} */
  let connectedProvider = null;
  let address = '', attempt = 0, pending = false;

  /** @param {unknown} accounts @returns {string} */
  function firstAddress(accounts) {
    return Array.isArray(accounts) && typeof accounts[0] === 'string' && /^0x[a-fA-F0-9]{40}$/.test(accounts[0]) ? accounts[0] : '';
  }
  function updateConnection() {
    text.textContent = address ? `${address.slice(0, 6)}…${address.slice(-4)} · Spectator` : 'Connect wallet';
    trigger.setAttribute('aria-label', address ? 'Connected spectator wallet; view address or disconnect' : 'Connect wallet in read-only spectator mode');
    current.hidden = !address;
    current.textContent = address ? `Spectator address: ${address}` : '';
    disconnectBtn.hidden = !address;
    options.hidden = !!address;
  }
  /** @param {unknown[]} accounts */
  function onAccounts(...accounts) {
    address = firstAddress(accounts[0]);
    if (!address) disconnectLocal();
    else { updateConnection(); status.textContent = 'Spectator address updated. The benchmark is unchanged.'; }
  }
  function onDisconnect() { disconnectLocal(); }
  function disconnectLocal() {
    attempt++; pending = false;
    connectedProvider?.removeListener?.('accountsChanged', onAccounts);
    connectedProvider?.removeListener?.('disconnect', onDisconnect);
    connectedProvider = null; address = '';
    updateConnection(); renderWallets();
    status.textContent = 'Spectator disconnected from this page. You can continue as a guest.';
  }
  /** @param {Wallet} wallet @param {HTMLButtonElement} row */
  async function connect(wallet, row) {
    if (pending) return;
    const requestAttempt = ++attempt;
    pending = true;
    for (const button of options.querySelectorAll('button')) button.disabled = true;
    row.textContent = `${wallet.name} · opening…`;
    status.textContent = 'Waiting for address access. No signature or transaction will be requested.';
    try {
      const accounts = await wallet.provider.request({ method: 'eth_requestAccounts' });
      if (attempt !== requestAttempt || !dialog.open) return;
      const selected = firstAddress(accounts);
      if (!selected) throw new Error('No account');
      address = selected; connectedProvider = wallet.provider;
      connectedProvider.on?.('accountsChanged', onAccounts);
      connectedProvider.on?.('disconnect', onDisconnect);
      updateConnection();
      log('Wallet connected as a read-only spectator. Demo scores are separate from the wallet.');
      status.textContent = '';
      dialog.close();
    } catch (error) {
      if (attempt !== requestAttempt || !dialog.open) return;
      status.textContent = typeof error === 'object' && error && 'code' in error && error.code === 4001
        ? 'Address access was declined. Try again or close this to continue as a guest.'
        : 'Unable to read an account. Unlock your wallet and retry, or continue as a guest.';
    } finally {
      if (attempt === requestAttempt) { pending = false; renderWallets(); }
    }
  }
  function renderWallets() {
    if (pending) return;
    options.replaceChildren();
    const wallets = [...discovered.values()];
    // Legacy providers remain usable when no EIP-6963 provider has announced itself.
    const legacy = /** @type {Window & {ethereum?: Provider}} */ (window).ethereum;
    if (!wallets.length && legacy && typeof legacy.request === 'function') wallets.push({ uuid: 'legacy', name: 'Browser wallet', provider: legacy });
    for (const wallet of wallets) {
      const row = document.createElement('button');
      row.type = 'button'; row.className = 'sqk-btn sqk-btn-outline';
      if (wallet.icon?.startsWith('data:image/')) {
        const icon = document.createElement('img'); icon.src = wallet.icon; icon.alt = ''; icon.width = 28; icon.height = 28; row.append(icon);
      }
      row.append(document.createTextNode(wallet.name));
      row.addEventListener('click', () => { void connect(wallet, row); });
      options.append(row);
    }
    if (!wallets.length) {
      const note = document.createElement('p');
      note.textContent = 'No browser wallet detected. Continue as a guest, or open this page inside a wallet app on your phone.';
      options.append(note);
    }
    if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) && !wallets.length) {
      const url = location.href;
      const links = [
        { name: 'MetaMask', href: `https://link.metamask.io/dapp/${url.replace(/^https?:\/\//, '')}` },
        { name: 'Coinbase Wallet', href: `https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(url)}` },
        { name: 'Phantom', href: `https://phantom.app/ul/browse/${encodeURIComponent(url)}?ref=${encodeURIComponent(location.origin)}` }
      ];
      for (const wallet of links) {
        const link = document.createElement('a'); link.href = wallet.href; link.className = 'sqk-btn sqk-btn-outline'; link.textContent = `Open in ${wallet.name}`; options.append(link);
      }
    }
  }
  window.addEventListener('eip6963:announceProvider', event => {
    const detail = /** @type {CustomEvent} */ (event).detail;
    if (!detail?.info || typeof detail.info.uuid !== 'string' || typeof detail.info.name !== 'string' || typeof detail.provider?.request !== 'function') return;
    if (discovered.has(detail.info.uuid)) return;
    discovered.set(detail.info.uuid, { uuid: detail.info.uuid, name: detail.info.name, icon: detail.info.icon, provider: detail.provider });
    if (dialog.open && !address) renderWallets();
  });
  window.dispatchEvent(new Event('eip6963:requestProvider'));
  trigger.addEventListener('click', () => {
    status.textContent = ''; updateConnection(); renderWallets(); dialog.showModal();
    window.dispatchEvent(new Event('eip6963:requestProvider'));
  });
  element('wallet-close', HTMLButtonElement).addEventListener('click', () => dialog.close());
  dialog.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const controls = [...dialog.querySelectorAll('button:not(:disabled), a[href]')].filter(node => node instanceof HTMLElement && node.getClientRects().length);
    const first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first && last instanceof HTMLElement) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && document.activeElement === last && first instanceof HTMLElement) {
      event.preventDefault(); first.focus();
    }
  });
  dialog.addEventListener('click', event => {
    const rect = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
  });
  dialog.addEventListener('close', () => { attempt++; pending = false; trigger.focus(); });
  disconnectBtn.addEventListener('click', disconnectLocal);
  updateConnection();
}

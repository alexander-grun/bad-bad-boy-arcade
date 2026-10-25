// Keep this entry point independent of the game module graph: import failures
// must be visible even when the renderer or its dependencies cannot initialise.
(() => {
  const status = document.querySelector('#load-status');
  const start = document.querySelector('#start');
  const retry = document.querySelector('#retry-load');
  let ready = false;
  const timeout = setTimeout(() => fail(new Error('Loading took too long. Please retry.')), 30000);

  function fail(error) {
    if (ready) return;
    clearTimeout(timeout);
    console.error('Game startup failed:', error);
    status.classList.remove('hidden');
    status.textContent = `Could not start the game. ${error?.message || String(error)}`;
    start.disabled = true;
    start.textContent = 'UNABLE TO START';
    retry.hidden = false;
  }
  retry.addEventListener('click', () => window.location.reload());
  window.addEventListener('error', event => fail(event.error ?? new Error(event.message)));
  window.addEventListener('unhandledrejection', event => fail(event.reason));
  window.addEventListener('game:load-error', event => fail(event.detail));
  window.addEventListener('game:ready', () => {
    ready = true;
    clearTimeout(timeout);
    retry.hidden = true;
  });
  import('game').catch(fail);
})();

// Theme toggle with system default + persistence.
(function () {
  const root = document.documentElement;
  const stored = localStorage.getItem('nekko-theme');
  const system = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  root.setAttribute('data-theme', stored || system);

  document.getElementById('theme-toggle')?.addEventListener('click', () => {
    const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    localStorage.setItem('nekko-theme', next);
  });

  // Highlight the download card matching the visitor's OS.
  const ua = navigator.userAgent;
  const os = /Win/.test(ua) ? 'win' : /Mac/.test(ua) ? 'mac' : /Linux|X11/.test(ua) ? 'linux' : null;
  if (os) {
    const card = document.querySelector(`.dl[data-os="${os}"]`);
    if (card) card.style.borderColor = 'var(--accent)';
  }
})();

(function () {
  function initHamburger() {
    const header = document.querySelector('header');
    const nav = document.querySelector('header .navbar, header nav');
    if (!header || !nav) return;
    if (document.getElementById('mobile-hamburger')) return;

    const btn = document.createElement('button');
    btn.id = 'mobile-hamburger';
    btn.type = 'button';
    btn.className = 'mobile-hamburger';
    btn.setAttribute('aria-label', 'Abrir menu');
    btn.innerHTML = '<span></span><span></span><span></span>';

    btn.addEventListener('click', () => {
      document.body.classList.toggle('navbar-open');
    });

    header.insertBefore(btn, header.firstChild);

    const mq = window.matchMedia('(min-width: 769px)');
    function onDesktop() {
      if (mq.matches) document.body.classList.remove('navbar-open');
    }
    onDesktop();
    try { mq.addEventListener('change', onDesktop); } catch (_) {}
  }

  document.addEventListener('DOMContentLoaded', initHamburger);
})();

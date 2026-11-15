const mobileHomeToggle = document.querySelector('.home-menu-toggle');
const mobileHomeMenu = mobileHomeToggle.closest('.home-menu');

function setMobileHomeOpen(isOpen) {
  mobileHomeToggle.setAttribute('aria-expanded', String(isOpen));
}

mobileHomeToggle.addEventListener('click', () => {
  setMobileHomeOpen(mobileHomeToggle.getAttribute('aria-expanded') !== 'true');
});

document.addEventListener('click', event => {
  if (!mobileHomeMenu.contains(event.target) || event.target.closest('.home-dropdown a')) {
    setMobileHomeOpen(false);
  }
});

mobileHomeMenu.addEventListener('keydown', event => {
  if (event.key === 'Escape' && mobileHomeToggle.getAttribute('aria-expanded') === 'true') {
    setMobileHomeOpen(false);
    mobileHomeToggle.focus();
  }
});

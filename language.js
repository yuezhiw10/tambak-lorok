const languageLink = document.querySelector('.language-switch a');
const alternatePage = new URL(languageLink.href);

function preserveSection() {
  alternatePage.hash = window.location.hash;
  languageLink.href = alternatePage.href;
}

preserveSection();
window.addEventListener('hashchange', preserveSection);

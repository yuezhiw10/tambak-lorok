const labIntro = document.getElementById('lab-intro');
const labIntroKey = 'civic-resilience-lab-intro-dismissed';
let labIntroDismissed = false;

try {
  labIntroDismissed = sessionStorage.getItem(labIntroKey) === 'yes';
} catch {
  // The dialog can still open if the browser blocks session storage.
}

if (!labIntroDismissed) {
  labIntro.addEventListener('close', () => {
    try {
      sessionStorage.setItem(labIntroKey, 'yes');
    } catch {
      // Dismissal still works for the current page.
    }
  }, { once: true });
  labIntro.showModal();
}

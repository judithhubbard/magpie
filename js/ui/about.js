// Tiny module for the About modal. Wires the header button + close handlers.

const button = document.getElementById('about-button');
const modal  = document.getElementById('about-modal');

export function init() {
  if (!button || !modal) return;
  button.addEventListener('click', () => { modal.hidden = false; });
  modal.addEventListener('click', (e) => {
    if (e.target.dataset.close !== undefined || e.target.classList.contains('modal-backdrop')) {
      modal.hidden = true;
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) modal.hidden = true;
  });
}

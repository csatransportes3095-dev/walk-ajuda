(() => {
  const isCustomersPage = () => location.pathname === '/admin/customers' || location.pathname.startsWith('/admin/customers/');

  const textIncludes = (el, value) => (el?.textContent || '').trim().includes(value);

  function compactCustomerCards() {
    if (!isCustomersPage()) return;

    // Abre automaticamente os detalhes de cada cliente, sem mexer na regra React.
    document.querySelectorAll('button').forEach((button) => {
      const text = (button.textContent || '').trim();
      if (text.includes('Ver dados e controles')) {
        button.click();
      }
    });

    // Encontra a grade principal dos clientes.
    const grids = Array.from(document.querySelectorAll('div')).filter((el) => {
      const c = el.className;
      return typeof c === 'string' && c.includes('grid-cols-1') && c.includes('sm:grid-cols-2') && (c.includes('lg:grid-cols-4') || c.includes('xl:grid-cols-4'));
    });

    const grid = grids.find((el) => el.querySelector('button[title="Editar"], button[title*="Editar"]')) || grids[0];
    if (grid) {
      grid.style.gridTemplateColumns = window.innerWidth >= 1024 ? 'repeat(4, minmax(0, 1fr))' : '';
      grid.style.gap = window.innerWidth >= 1024 ? '10px' : '';

      // Usa praticamente toda a largura da tela no desktop.
      let parent = grid.parentElement;
      for (let i = 0; i < 5 && parent; i += 1, parent = parent.parentElement) {
        if (typeof parent.className === 'string' && parent.className.includes('container')) {
          parent.style.width = '100%';
          parent.style.maxWidth = 'none';
          parent.style.paddingLeft = window.innerWidth >= 1024 ? '18px' : '';
          parent.style.paddingRight = window.innerWidth >= 1024 ? '18px' : '';
          break;
        }
      }
    }

    // Compacta o widget "Rotas de acesso" sem esconder nenhum controle.
    Array.from(document.querySelectorAll('span')).filter((el) => textIncludes(el, 'Rotas de acesso')).forEach((title) => {
      const box = title.closest('div.w-full') || title.parentElement?.parentElement;
      if (!box) return;
      box.style.padding = '6px';
      box.style.borderRadius = '8px';

      box.querySelectorAll('label').forEach((label) => {
        label.style.height = '28px';
        label.style.minHeight = '28px';
        label.style.paddingLeft = '6px';
        label.style.paddingRight = '6px';
        label.style.gap = '6px';
      });

      box.querySelectorAll('input[type="checkbox"]').forEach((input) => {
        input.style.width = '16px';
        input.style.height = '16px';
      });

      box.querySelectorAll('p').forEach((p) => {
        p.style.marginTop = '3px';
        p.style.fontSize = '8px';
      });
    });

    // O botao continua existindo no React para seguranca, mas some da interface depois de abrir.
    document.querySelectorAll('button').forEach((button) => {
      const text = (button.textContent || '').trim();
      if (text.includes('Ocultar detalhes') || text.includes('Ver dados e controles')) {
        button.style.display = 'none';
      }
    });
  }

  let raf = 0;
  const schedule = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(compactCustomerCards);
  };

  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('resize', schedule);
  window.addEventListener('popstate', schedule);
  document.addEventListener('DOMContentLoaded', schedule);
  setTimeout(schedule, 300);
  setTimeout(schedule, 1200);
})();

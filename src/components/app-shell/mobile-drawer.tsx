'use client';

import { useEffect } from 'react';
import { GLASS_CLASS } from '@/components/surface';
import { Sidebar } from './sidebar';

/** Below `lg`, where the top bar has no pills, every page is in this drawer. */
export function MobileDrawer({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <button
        type="button"
        aria-label="Close menu"
        onClick={onClose}
        className="absolute inset-0 bg-paper/70 [backdrop-filter:var(--glass-blur)]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        className={`absolute inset-y-0 left-0 w-72 max-w-[85vw] ${GLASS_CLASS} shadow-xl`}
      >
        <Sidebar onNavigate={onClose} />
      </div>
    </div>
  );
}

"use client";

import type { MouseEvent, ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { content } from '@/content/tyv';

type Props = {
  quickControls?: ReactNode;
  children: ReactNode;
};

export default function SubcategoryFilterBar({ quickControls, children }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const drawerTitleId = 'category-filter-drawer-title';

  const closeFilters = useCallback(() => {
    setIsOpen(false);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const scrollY = window.scrollY;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    const previousBodyStyles = {
      left: document.body.style.left,
      overflow: document.body.style.overflow,
      paddingRight: document.body.style.paddingRight,
      position: document.body.style.position,
      top: document.body.style.top,
      width: document.body.style.width,
    };

    document.body.style.overflow = 'hidden';
    document.body.style.left = '0';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';

    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        closeFilters();
      }
    }

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.left = previousBodyStyles.left;
      document.body.style.overflow = previousBodyStyles.overflow;
      document.body.style.paddingRight = previousBodyStyles.paddingRight;
      document.body.style.position = previousBodyStyles.position;
      document.body.style.top = previousBodyStyles.top;
      document.body.style.width = previousBodyStyles.width;
      window.scrollTo(0, scrollY);
    };
  }, [closeFilters, isOpen]);

  function handleOverlayClick(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) {
      closeFilters();
    }
  }

  const drawer =
    isOpen && typeof document !== 'undefined'
      ? createPortal(
          <div className="category-filter-overlay" onClick={handleOverlayClick}>
            <div
              className="category-filter-backdrop"
              aria-hidden="true"
              onClick={closeFilters}
            />
            <aside
              id="category-filter-panel"
              className="category-filter-panel is-open"
              role="dialog"
              aria-modal="true"
              aria-labelledby={drawerTitleId}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="category-filter-panel-heading">
                <h2 id={drawerTitleId}>{content.filterControlsLabel}</h2>
                <button
                  ref={closeButtonRef}
                  type="button"
                  className="category-filter-close"
                  aria-label={content.closeFiltersButton}
                  onClick={closeFilters}
                >
                  ×
                </button>
              </div>
              <div
                className="category-filter-panel-body"
                onSubmit={closeFilters}
              >
                {children}
              </div>
            </aside>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <section className="category-filter-bar" aria-label={content.filterControlsLabel}>
        <div className="category-filter-bar-inner">
          <div className="category-filter-actions">
            {quickControls ? (
              <div className="category-filter-quick-controls">
                {quickControls}
              </div>
            ) : null}
            <button
              type="button"
              className="category-filter-toggle"
              aria-expanded={isOpen}
              aria-controls="category-filter-panel"
              onClick={() => setIsOpen((current) => !current)}
            >
              <span aria-hidden="true">⚙</span>
              {content.filterControlsButton}
            </button>
          </div>
        </div>
      </section>
      {drawer}
    </>
  );
}

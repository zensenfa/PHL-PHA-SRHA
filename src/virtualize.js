// Row-window computation for virtualized tables (build plan §5, P5 — the
// suggestion tray and hazard workspace both need this at 500-1,000+ rows;
// copied verbatim from RHL's virtualize.js, proven at 5,000 rows there).
// Pure — no DOM. Given a scroll position and row geometry, returns which
// slice of `items` to actually render, plus the padding needed above/below
// so the scrollbar still reflects the true total height.
(function () {
/**
 * @param {object} opts
 * @param {number} opts.scrollTop - current scrollTop of the scrolling container
 * @param {number} opts.rowHeight - fixed row height in px
 * @param {number} opts.viewportHeight - visible height of the scrolling container
 * @param {number} opts.totalRows - total item count
 * @param {number} [opts.overscan] - extra rows rendered above/below the viewport, absorbs scroll jitter
 */
function computeVisibleRange({ scrollTop, rowHeight, viewportHeight, totalRows, overscan = 10 }) {
  if (totalRows <= 0 || rowHeight <= 0) {
    return { startIndex: 0, endIndex: 0, topPadding: 0, bottomPadding: 0 };
  }
  const firstVisible = Math.floor(scrollTop / rowHeight);
  const visibleCount = Math.ceil(viewportHeight / rowHeight);

  const startIndex = Math.max(0, firstVisible - overscan);
  const endIndex = Math.min(totalRows, firstVisible + visibleCount + overscan);

  return {
    startIndex,
    endIndex,
    topPadding: startIndex * rowHeight,
    bottomPadding: (totalRows - endIndex) * rowHeight,
  };
}

const api = { computeVisibleRange };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
} else {
  window.RMG_VIRTUALIZE = api;
}
})();



import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';

interface ReaderPage { url: string; route: string; label: string; }
interface Props { pages: ReaderPage[]; initialPage: number; title: string; workUrl: string; }

const SWIPE_THRESHOLD = 55;
const bodyPage = (page: ReaderPage) => /^\d+$/.test(page.route);

function desktopSpreads(pages: ReaderPage[]): ReaderPage[][] {
  const find = (route: string) => pages.find((page) => page.route === route);
  const front = find('cover-1');
  const insideFront = find('cover-2');
  const insideBack = find('cover-3');
  const back = find('cover-4');
  const body = pages.filter(bodyPage);
  const spreads: ReaderPage[][] = [];

  if (front) spreads.push([front]);
  if (insideFront && body.length) spreads.push([insideFront, body.shift()!]);
  else if (insideFront) spreads.push([insideFront]);
  else if (body.length) spreads.push([body.shift()!]);

  while (body.length >= 2) spreads.push(body.splice(0, 2));
  if (body.length && insideBack) spreads.push([body.shift()!, insideBack]);
  else {
    if (body.length) spreads.push([body.shift()!]);
    if (insideBack) spreads.push([insideBack]);
  }
  if (back) spreads.push([back]);
  return spreads;
}

export default function MangaReader({ pages, initialPage, title, workUrl }: Props) {
  const [wide, setWide] = useState(false);
  const [activeRoute, setActiveRoute] = useState(pages[initialPage].route);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [uiVisible, setUiVisible] = useState(true);
  const pointerStart = useRef(0);
  const dragged = useRef(false);
  const units = useMemo(() => wide ? desktopSpreads([...pages]) : pages.map((page) => [page]), [pages, wide]);
  const currentUnit = Math.max(0, units.findIndex((unit) => unit.some((page) => page.route === activeRoute)));

  useEffect(() => {
    const media = window.matchMedia('(min-width: 900px) and (min-aspect-ratio: 4/3)');
    const update = () => setWide(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  const goToUnit = useCallback((index: number) => {
    const nextIndex = Math.max(0, Math.min(units.length - 1, index));
    const unit = units[nextIndex];
    const destination = unit.find(bodyPage) || unit[0];
    setActiveRoute(destination.route);
    setDragOffset(0);
    window.history.replaceState({}, '', `${workUrl}${destination.route}/`);
  }, [units, workUrl]);
  const previous = useCallback(() => goToUnit(currentUnit - 1), [currentUnit, goToUnit]);
  const next = useCallback(() => goToUnit(currentUnit + 1), [currentUnit, goToUnit]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft' || event.key === 'PageDown') { event.preventDefault(); next(); }
      if (event.key === 'ArrowRight' || event.key === 'PageUp') { event.preventDefault(); previous(); }
      if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); setUiVisible((value) => !value); }
      if (event.key === 'Escape') setUiVisible(true);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [next, previous]);

  useEffect(() => {
    [currentUnit + 1, currentUnit - 1, currentUnit + 2].forEach((index) => {
      units[index]?.forEach((page) => { const image = new Image(); image.src = page.url; });
    });
  }, [currentUnit, units]);

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    pointerStart.current = event.clientX;
    dragged.current = false;
    setIsDragging(true);
    event.currentTarget instanceof HTMLElement && event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent) => {
    if (!isDragging) return;
    const offset = event.clientX - pointerStart.current;
    if (Math.abs(offset) > 8) dragged.current = true;
    setDragOffset(offset);
  };
  const onPointerUp = (event: PointerEvent) => {
    if (!isDragging) return;
    setIsDragging(false);
    if (dragOffset > SWIPE_THRESHOLD) next();
    else if (dragOffset < -SWIPE_THRESHOLD) previous();
    else {
      setDragOffset(0);
      if (!dragged.current) {
        const ratio = event.clientX / window.innerWidth;
        if (wide) {
          if (ratio < .5) next();
          else previous();
        } else if (ratio < .32) next();
        else if (ratio > .68) previous();
        else setUiVisible((value) => !value);
      }
    }
  };

  const visibleUnits = [currentUnit - 1, currentUnit, currentUnit + 1].filter((index) => units[index]);
  const currentLabel = units[currentUnit].map((page) => page.label).join('・');

  return (
    <main class="reader" aria-label={`${title} 漫画リーダー`}>
      <div class={`stage ${isDragging ? 'dragging' : ''}`} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={() => { setIsDragging(false); setDragOffset(0); }}>
        {visibleUnits.map((index) => {
          const unit = units[index];
          const position = index - currentUnit;
          return <div key={unit.map((page) => page.route).join(':')} class={`spread ${unit.length === 1 ? 'single' : ''}`} style={{ transform: `translate3d(calc(${position * -100}vw + ${dragOffset}px), 0, 0)` }}>
            {(unit.length === 2 ? unit.toReversed() : unit).map((page) => <img key={page.url} src={page.url} alt={page.label} decoding="async" draggable={false} />)}
          </div>;
        })}
        <span class={`turn-zone next-zone ${currentUnit === units.length - 1 ? 'disabled' : ''}`} aria-hidden="true" />
        <span class={`turn-zone previous-zone ${currentUnit === 0 ? 'disabled' : ''}`} aria-hidden="true" />
      </div>

      <div class={`reader-ui ${uiVisible ? 'visible' : ''}`} aria-hidden={!uiVisible}>
        <header><a href={workUrl} aria-label="作品ページへ戻る">←</a><strong>{title}</strong><span /></header>
        <footer>
          <button type="button" onClick={next} disabled={currentUnit === units.length - 1}>次ページ</button>
          <label><span>{currentLabel}</span><input aria-label="ページを選択" dir="rtl" type="range" min="1" max={units.length} value={currentUnit + 1} onInput={(event) => goToUnit(Number(event.currentTarget.value) - 1)} /></label>
          <button type="button" onClick={previous} disabled={currentUnit === 0}>前ページ</button>
        </footer>
      </div>
      <style>{`
        .reader { position: fixed; inset: 0; overflow: hidden; background: #050505; color: white; user-select: none; }
        .stage { position: absolute; inset: 0; overflow: hidden; touch-action: none; cursor: grab; }
        .stage.dragging { cursor: grabbing; }
        .spread { position: absolute; inset: 0; min-width: 0; min-height: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: center; justify-content: center; overflow: hidden; transition: transform .22s ease-out; }
        .spread.single { display: flex; }
        .spread img { display: block; width: 100%; height: 100%; min-width: 0; min-height: 0; max-width: 100%; max-height: 100dvh; object-fit: contain; pointer-events: none; }
        .spread.single img { width: 100%; min-height: 0; object-fit: contain; }
        .spread:not(.single) img:first-child { object-position: right center; }
        .spread:not(.single) img:last-child { object-position: left center; }
        .dragging .spread { transition: none; }
        .reader-ui { pointer-events: none; opacity: 0; transition: opacity .18s ease; }
        .reader-ui.visible { opacity: 1; }
        header, footer { position: absolute; z-index: 2; left: 0; right: 0; display: flex; align-items: center; background: rgb(5 5 5 / 78%); backdrop-filter: blur(12px); pointer-events: none; }
        .visible header, .visible footer { pointer-events: auto; }
        header { top: 0; min-height: calc(56px + env(safe-area-inset-top)); padding: env(safe-area-inset-top) 16px 0; justify-content: space-between; }
        header a { display: grid; width: 44px; height: 44px; place-items: center; color: white; text-decoration: none; font-size: 1.4rem; }
        header strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: .9rem; }
        header span { width: 44px; }
        footer { bottom: 0; min-height: calc(74px + env(safe-area-inset-bottom)); padding: 10px 12px env(safe-area-inset-bottom); gap: 10px; }
        button { min-width: 72px; min-height: 44px; border: 1px solid #555; border-radius: 6px; background: #242424; color: white; }
        button:disabled { opacity: .35; }
        .stage .turn-zone { position: absolute; z-index: 1; top: 0; bottom: 0; width: 32%; min-width: 0; min-height: 0; padding: 0; border: 0; border-radius: 0; background: transparent; opacity: 1; }
        .stage .turn-zone.disabled { cursor: default; }
        .stage .next-zone { left: 0; cursor: w-resize; }
        .stage .previous-zone { right: 0; cursor: e-resize; }
        .stage.dragging .turn-zone { cursor: grabbing; }
        label { flex: 1; display: grid; gap: 6px; text-align: center; font-size: .78rem; }
        input { width: 100%; accent-color: #b68bdd; }
        @media (max-width: 899px), (max-aspect-ratio: 4/3) { .spread { display: flex; } .spread img { width: 100%; } }
        @media (min-width: 900px) and (min-aspect-ratio: 4/3) { .stage .turn-zone { width: 50%; } }
        @media (max-width: 520px) { footer button { min-width: 54px; padding-inline: 6px; font-size: .75rem; } }
      `}</style>
    </main>
  );
}

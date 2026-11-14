import { useEffect, useState } from 'react';
import { readSlide } from './pptx';
import type { Deck, Slide, SlideElement } from './pptx';

function Shape({ item }: { item: SlideElement }) {
  const { width: w, height: h } = item;
  const style = { fill: item.fill, stroke: item.stroke, strokeWidth: item.strokeWidth };
  if (item.image) return null;
  if (item.geometry === 'ellipse') return <ellipse cx={w / 2} cy={h / 2} rx={w / 2} ry={h / 2} {...style} />;
  if (item.geometry === 'triangle') return <polygon points={`${w / 2},0 ${w},${h} 0,${h}`} {...style} />;
  if (item.geometry === 'diamond') return <polygon points={`${w / 2},0 ${w},${h / 2} ${w / 2},${h} 0,${h / 2}`} {...style} />;
  if (item.geometry === 'rtTriangle') return <polygon points={`0,0 ${w},${h} 0,${h}`} {...style} />;
  if (!['rect', 'roundRect', 'line'].includes(item.geometry)) return null;
  if (item.geometry === 'line') return <line x1={0} y1={0} x2={w} y2={h} {...style} stroke={item.stroke === 'none' ? '#222' : item.stroke} />;
  return <rect width={w} height={h} rx={item.geometry === 'roundRect' ? Math.min(w, h) / 8 : 0} {...style} />;
}

export function Pptx({ deck, page, onError }: { deck: Deck; page: number; onError: (message: string) => void }) {
  const [view, setView] = useState<{ page: number; slide: Slide; images: (string | undefined)[] } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const urls: string[] = [];
    void readSlide(deck, page, controller.signal).then(slide => {
      if (controller.signal.aborted) return;
      const images = slide.elements.map(item => {
        if (!item.image) return undefined;
        const url = URL.createObjectURL(item.image); urls.push(url); return url;
      });
      setView({ page, slide, images });
    }).catch(error => { if (!controller.signal.aborted) onError(error instanceof Error ? error.message : 'تعذّر عرض الشريحة.'); });
    return () => { controller.abort(); urls.forEach(url => URL.revokeObjectURL(url)); };
  }, [deck, page, onError]);
  if (view?.page !== page) return <p className="slide-loading">جارٍ عرض الشريحة…</p>;
  return <svg className="pptx-slide" viewBox={`0 0 ${deck.width} ${deck.height}`} role="img" aria-label={`شريحة ${page}`}>
    <rect width={deck.width} height={deck.height} fill={view.slide.background} />
    {view.slide.elements.map((item, elementAt) => {
      const imageHref = view.images[elementAt];
      return <g key={`${item.geometry}-${item.x}-${item.y}-${item.width}-${item.height}-${item.parentTransform}`} transform={`${item.parentTransform} translate(${item.x} ${item.y}) rotate(${item.rotation} ${item.width / 2} ${item.height / 2})`}>
        <Shape item={item} />
        {imageHref && <image href={imageHref} width={item.width} height={item.height} preserveAspectRatio="xMidYMid meet" />}
        {!!item.paragraphs.length && <foreignObject width={item.width} height={item.height}>
          <div className="slide-text" style={{ width: item.width, height: item.height, padding: item.insets.map(value => `${value}px`).join(' '), justifyContent: item.anchor === 'ctr' ? 'center' : item.anchor === 'b' ? 'flex-end' : 'flex-start' }}>
            {item.paragraphs.map((paragraph) => {
              const paragraphText = paragraph.runs.map(r => r.text).join('');
              return <p key={`${paragraph.align}-${paragraph.rtl}-${paragraphText.slice(0, 48)}-${paragraph.runs.length}`} dir={paragraph.rtl ? 'rtl' : 'auto'} style={{ textAlign: paragraph.align === 'ctr' ? 'center' : paragraph.align === 'r' ? 'right' : 'left' }}>
                {paragraph.runs.map((run) => <span key={`${run.text}-${run.size}-${run.color}-${run.bold}-${run.italic}`} style={{ fontSize: run.size, color: run.color, fontWeight: run.bold ? 700 : 400, fontStyle: run.italic ? 'italic' : 'normal' }}>{run.text}</span>)}
              </p>;
            })}
          </div>
        </foreignObject>}
      </g>;
    })}
    {view.slide.limited && <text x={deck.width - 8} y={deck.height - 6} textAnchor="end" fontSize={8} fill="#555">معاينة مبسطة · بعض العناصر غير معروضة</text>}
  </svg>;
}

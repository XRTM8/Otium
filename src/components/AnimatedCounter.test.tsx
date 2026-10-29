import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { AnimatedCounter } from './AnimatedCounter';

describe('AnimatedCounter', () => {
  it('renders initial number value', () => {
    const html = renderToString(<AnimatedCounter value={5} />);
    expect(html).toContain('5');
  });

  it('renders string values correctly', () => {
    const html = renderToString(<AnimatedCounter value="12" />);
    expect(html).toContain('12');
  });
});

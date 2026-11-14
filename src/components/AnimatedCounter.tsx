import React, { useEffect, useState, useRef } from 'react';

interface AnimatedCounterProps {
  value: number | string;
  className?: string;
}

function computeDirection(prevValue: number | string, nextValue: number | string): 'up' | 'down' {
  const numCurrent =
    typeof prevValue === 'number' ? prevValue : Number.parseInt(String(prevValue), 10);
  const numNext =
    typeof nextValue === 'number' ? nextValue : Number.parseInt(String(nextValue), 10);
  return !Number.isNaN(numCurrent) && !Number.isNaN(numNext) && numNext < numCurrent ? 'down' : 'up';
}

export const AnimatedCounter: React.FC<AnimatedCounterProps> = ({ value, className = '' }) => {
  const [state, setState] = useState<{
    current: number | string;
    prev: number | string | null;
    direction: 'up' | 'down';
  }>({ current: value, prev: null, direction: 'up' });
  const timerRef = useRef<number | null>(null);

  if (value !== state.current) {
    setState({
      current: value,
      prev: state.current,
      direction: computeDirection(state.current, value)
    });
  }

  useEffect(() => {
    if (state.prev === null) return;
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => {
      setState((s) => (s.prev === null ? s : { ...s, prev: null }));
      timerRef.current = null;
    }, 240);
  }, [state.prev]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  const { current, prev, direction } = state;

  return (
    <span className={`inline-block relative overflow-hidden h-[1.3em] leading-[1.3em] align-middle font-mono ${className}`}>
      {prev !== null ? (
        <span
          key={`prev-${prev}`}
          aria-hidden="true"
          className={`block text-center ${direction === 'up' ? 'animate-counter-exit-up' : 'animate-counter-exit-down'}`}
        >
          {prev}
        </span>
      ) : null}
      <span
        key={`curr-${current}`}
        className={`block text-center ${prev !== null ? (direction === 'up' ? 'animate-counter-enter-up' : 'animate-counter-enter-down') : ''}`}
      >
        {current}
      </span>
    </span>
  );
};

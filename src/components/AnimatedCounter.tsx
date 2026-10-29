import React, { useEffect, useState, useRef } from 'react';

interface AnimatedCounterProps {
  value: number | string;
  className?: string;
}

export const AnimatedCounter: React.FC<AnimatedCounterProps> = ({ value, className = '' }) => {
  const [current, setCurrent] = useState(value);
  const [prev, setPrev] = useState<number | string | null>(null);
  const [direction, setDirection] = useState<'up' | 'down'>('up');
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (value !== current) {
      const numCurrent = typeof current === 'number' ? current : Number.parseInt(String(current), 10);
      const numNext = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
      setDirection(!Number.isNaN(numCurrent) && !Number.isNaN(numNext) && numNext < numCurrent ? 'down' : 'up');
      setPrev(current);
      setCurrent(value);

      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
      timerRef.current = window.setTimeout(() => {
        setPrev(null);
        timerRef.current = null;
      }, 240);
    }
  }, [value, current]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

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

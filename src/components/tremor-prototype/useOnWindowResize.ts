// PROTOTYPE (Tremor redesign): Tremor Raw, re-themed onto the Midnight tokens. Throwaway.
/* eslint-disable */
// @ts-nocheck -- vendored prototype code (strict index access, Recharts 3 types)
// Tremor useOnWindowResize [v0.0.2]

import * as React from 'react';

export const useOnWindowResize = (handler: () => void) => {
  React.useEffect(() => {
    const handleResize = () => {
      handler();
    };
    handleResize();
    window.addEventListener('resize', handleResize);

    return () => window.removeEventListener('resize', handleResize);
  }, [handler]);
};

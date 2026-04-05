import * as React from 'react';

export type MobileRoute = '/' | '/loteria' | '/monazos' | '/tickets' | '/premios' | '/mensajes' | '/ganancias' | '/printer';

type MobileNavContextValue = {
  pathname: MobileRoute;
  pendingLotteryId: string | null;
  pendingMonazosGameId: string | null;
  replace: (route: MobileRoute) => void;
  openLottery: (lotteryId?: string | null) => void;
  openMonazos: (gameId?: string | null) => void;
  consumeLotterySelection: () => string | null;
  consumeMonazosSelection: () => string | null;
};

const MobileNavContext = React.createContext<MobileNavContextValue | null>(null);

export function MobileNavProvider({ children }: { children: React.ReactNode }) {
  const [pathname, setPathname] = React.useState<MobileRoute>('/');
  const [pendingLotteryId, setPendingLotteryId] = React.useState<string | null>(null);
  const [pendingMonazosGameId, setPendingMonazosGameId] = React.useState<string | null>(null);

  const replace = React.useCallback((route: MobileRoute) => {
    setPathname(route);
    if (route !== '/loteria') setPendingLotteryId(null);
    if (route !== '/monazos') setPendingMonazosGameId(null);
  }, []);

  const openLottery = React.useCallback((lotteryId?: string | null) => {
    setPendingLotteryId(lotteryId || null);
    setPathname('/loteria');
  }, []);

  const openMonazos = React.useCallback((gameId?: string | null) => {
    setPendingMonazosGameId(gameId || null);
    setPathname('/monazos');
  }, []);

  const consumeLotterySelection = React.useCallback(() => {
    const current = pendingLotteryId;
    setPendingLotteryId(null);
    return current;
  }, [pendingLotteryId]);

  const consumeMonazosSelection = React.useCallback(() => {
    const current = pendingMonazosGameId;
    setPendingMonazosGameId(null);
    return current;
  }, [pendingMonazosGameId]);

  const value = React.useMemo<MobileNavContextValue>(
    () => ({
      pathname,
      pendingLotteryId,
      pendingMonazosGameId,
      replace,
      openLottery,
      openMonazos,
      consumeLotterySelection,
      consumeMonazosSelection,
    }),
    [pathname, pendingLotteryId, pendingMonazosGameId, replace, openLottery, openMonazos, consumeLotterySelection, consumeMonazosSelection],
  );

  return <MobileNavContext.Provider value={value}>{children}</MobileNavContext.Provider>;
}

export function useMobileNav() {
  const value = React.useContext(MobileNavContext);
  if (!value) {
    throw new Error('useMobileNav must be used within MobileNavProvider');
  }
  return value;
}



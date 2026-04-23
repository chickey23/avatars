import { createContext, useContext, type ReactNode } from "react";
import type { AppContentViewValue } from "./useAppContentModel";

const AppContentViewContext = createContext<AppContentViewValue | null>(null);

export function AppContentViewProvider({
  value,
  children,
}: {
  value: AppContentViewValue;
  children: ReactNode;
}) {
  return (
    <AppContentViewContext.Provider value={value}>
      {children}
    </AppContentViewContext.Provider>
  );
}

export function useAppContentView(): AppContentViewValue {
  const v = useContext(AppContentViewContext);
  if (v == null) {
    throw new Error("useAppContentView must be used within AppContentViewProvider");
  }
  return v;
}

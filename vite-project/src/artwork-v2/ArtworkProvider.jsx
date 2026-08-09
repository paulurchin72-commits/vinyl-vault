import { createContext, useMemo } from "react";

export const ArtworkContext = createContext(null);

function ArtworkProvider({ children }) {
  const value = useMemo(() => ({
    version: "artwork-v2",
  }), []);

  return <ArtworkContext.Provider value={value}>{children}</ArtworkContext.Provider>;
}

export default ArtworkProvider;

import "./polyfills";
import React, { useMemo } from "react";
import ReactDOM from "react-dom/client";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import App from "./App";
import Gallery from "./components/Gallery";
import { RPC_URL } from "./game/chain";
import "@solana/wallet-adapter-react-ui/styles.css";
import "./styles.css";

function Root() {
  // Phantom и другие кошельки подхватываются через Wallet Standard
  const wallets = useMemo(() => [], []);
  return (
    <ConnectionProvider endpoint={RPC_URL}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          {location.search.includes("gallery") ? <Gallery /> : <App />}
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);

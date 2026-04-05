export {};

declare global {
  interface InjectedEthereumProvider {
    isCoinbaseWallet?: boolean;
    isMetaMask?: boolean;
    providers?: InjectedEthereumProvider[];
    on?: (eventName: string, listener: (...args: any[]) => void | Promise<void>) => void;
    removeListener?: (eventName: string, listener: (...args: any[]) => void | Promise<void>) => void;
    request: (args: { method: string; params?: unknown[] | Record<string, unknown>[] }) => Promise<any>;
  }

  interface Window {
    ethereum?: InjectedEthereumProvider;
  }
}

declare module "*.css";

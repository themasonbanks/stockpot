import "react-native-url-polyfill/auto";
import { createMobileSupabaseClient } from "@stockpot/database";
import * as ExpoCrypto from "expo-crypto";
import { Platform } from "react-native";
import { authStorage } from "./storage";
export type MobileClient = ReturnType<typeof createMobileSupabaseClient>;
function installNativeCrypto() {
  if (Platform.OS === "web" || globalThis.crypto?.subtle) return;
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: {
      getRandomValues: ExpoCrypto.getRandomValues,
      subtle: {
        async digest(algorithm: AlgorithmIdentifier, data: BufferSource) {
          const name = typeof algorithm === "string" ? algorithm : algorithm.name;
          if (name.toUpperCase() !== "SHA-256") throw new Error("Unsupported digest");
          const bytes =
            data instanceof ArrayBuffer
              ? new Uint8Array(data)
              : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
          return ExpoCrypto.digest(ExpoCrypto.CryptoDigestAlgorithm.SHA256, Uint8Array.from(bytes));
        },
      },
    },
  });
}
export function createAuthRuntime() {
  installNativeCrypto();
  const client = createMobileSupabaseClient({
    url: process.env.EXPO_PUBLIC_SUPABASE_URL,
    anonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    storage: authStorage,
  });
  return { client, storage: authStorage };
}

import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { createChunkedStorage, type KeyValueStorage } from "../auth/storage";

const nativeStorage = createChunkedStorage(
  {
    getItem: (key) => SecureStore.getItemAsync(key),
    setItem: (key, value) =>
      SecureStore.setItemAsync(key, value, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      }),
    removeItem: (key) => SecureStore.deleteItemAsync(key),
  },
  Crypto.randomUUID,
);
export const authStorage: KeyValueStorage =
  Platform.OS === "web"
    ? {
        async getItem(key) {
          return sessionStorage.getItem(key);
        },
        async setItem(key, value) {
          sessionStorage.setItem(key, value);
        },
        async removeItem(key) {
          sessionStorage.removeItem(key);
        },
      }
    : nativeStorage;

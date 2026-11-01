import * as Linking from "expo-linking";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Platform } from "react-native";
import { authStorage } from "../lib/storage";
import { inviteCodeFromUrl, normalizeInviteCode } from "./invite-link";

const KEY = "stockpot.pending-invite";
const Pending = createContext<{
  code: string | null;
  error: string | null;
  save(code: string): Promise<boolean>;
  clear(): Promise<void>;
} | null>(null);
export function usePendingInvite() {
  const value = useContext(Pending);
  if (!value) throw new Error("PendingInviteProvider missing");
  return value;
}
export function PendingInviteProvider({ children }: { children: ReactNode }) {
  const [code, setCode] = useState<string | null>(null),
    [error, setError] = useState<string | null>(null);
  const revision = useRef(0),
    active = useRef(true);
  const save = useCallback(async (value: string) => {
    const normalized = normalizeInviteCode(value);
    if (!normalized) {
      setError("Enter the full invitation code.");
      return false;
    }
    const current = ++revision.current;
    try {
      await authStorage.setItem(KEY, normalized);
      if (active.current && current === revision.current) {
        setCode(normalized);
        setError(null);
      }
      return true;
    } catch {
      if (active.current) setError("The invitation couldn’t be saved securely. Please retry.");
      return false;
    }
  }, []);
  async function clear() {
    ++revision.current;
    await authStorage.removeItem(KEY);
    if (active.current) {
      setCode(null);
      setError(null);
    }
  }
  useEffect(() => {
    active.current = true;
    const current = revision.current;
    const handle = (url: string | null) => {
      if (!url) return;
      const parsed = inviteCodeFromUrl(url);
      if (parsed)
        void save(parsed).then((saved) => {
          if (saved && Platform.OS === "web") window.history.replaceState(null, "", "/");
        });
    };
    const subscription = Linking.addEventListener("url", ({ url }) => handle(url));
    void authStorage
      .getItem(KEY)
      .then((stored) => {
        if (active.current && current === revision.current && stored)
          setCode(normalizeInviteCode(stored));
      })
      .catch(() => {
        if (active.current)
          setError("The saved invitation couldn’t be restored. Enter its code again.");
      });
    void Linking.getInitialURL().then((url) => {
      if (active.current) handle(url);
    });
    return () => {
      active.current = false;
      subscription.remove();
    };
  }, [save]);
  return <Pending.Provider value={{ code, error, save, clear }}>{children}</Pending.Provider>;
}

import AsyncStorage from "@react-native-async-storage/async-storage";
import { createMobileSupabaseClient } from "@stockpot/database";

export const supabase = createMobileSupabaseClient({
  url: process.env.EXPO_PUBLIC_SUPABASE_URL,
  anonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  storage: AsyncStorage,
});

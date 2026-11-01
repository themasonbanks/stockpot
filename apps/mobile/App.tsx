import { AuthBoundary, AuthProvider, useAuth } from "./src/auth";
import { HouseholdGate } from "./src/household/HouseholdGate";

function Kitchen() {
  const { client, user, signOut } = useAuth();
  return client && user ? (
    <HouseholdGate key={user.id} client={client} user={user} onSignOut={signOut} />
  ) : null;
}
export default function App() {
  return (
    <AuthProvider>
      <AuthBoundary>
        <Kitchen />
      </AuthBoundary>
    </AuthProvider>
  );
}

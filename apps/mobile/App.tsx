import { AuthBoundary, AuthProvider, useAuth } from "./src/auth";
import { HouseholdGate } from "./src/household/HouseholdGate";
import { PendingInviteProvider } from "./src/household/PendingInvite";

function Kitchen() {
  const { client, user, signOut } = useAuth();
  return client && user ? (
    <HouseholdGate key={user.id} client={client} user={user} onSignOut={signOut} />
  ) : null;
}
export default function App() {
  return (
    <PendingInviteProvider>
      <AuthProvider>
        <AuthBoundary>
          <Kitchen />
        </AuthBoundary>
      </AuthProvider>
    </PendingInviteProvider>
  );
}

import AuthForm from "@/components/AuthForm";

export default function AuthPage() {
  return (
    <div className="container" style={{ maxWidth: 420 }}>
      <h1 style={{ marginBottom: 8 }}>Sign in / Sign up</h1>
      <p style={{ opacity: 0.8, marginBottom: 16 }}>
        Create an account or log in.
      </p>
      <AuthForm />
    </div>
  );
}
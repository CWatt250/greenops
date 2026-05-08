export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="tlc-login-bg">
      {children}
    </div>
  );
}

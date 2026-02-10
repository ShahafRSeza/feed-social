import "./globals.css";

export const metadata = {
  title: "Halo Dashboard",
  description: "Social platform built with Next.js",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}

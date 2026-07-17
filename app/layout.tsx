export const metadata = {
  title: "Cartel",
  description: "Ramp for a shared cart.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

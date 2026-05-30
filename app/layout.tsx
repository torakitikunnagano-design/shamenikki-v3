export const metadata = {
  title: 'SHAMENIKKI AI',
  description: '写メ日記AIサポートツール',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ja">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <meta name="theme-color" content="#0d0b18" />
      </head>
      <body style={{ margin: 0, padding: 0, background: "#0d0b18", colorScheme: "dark" }}>{children}</body>
    </html>
  )
}

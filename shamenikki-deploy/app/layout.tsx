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
      <body style={{ margin: 0, padding: 0 }}>{children}</body>
    </html>
  )
}

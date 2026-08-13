import type { Viewport } from 'next'

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // maximum-scale / user-scalable は設定しない（ピンチ操作を禁止しない）
}

export const metadata = {
  title: '自動ミテネ',
  description: 'キャスト・出勤・ミテネ管理ツール',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ja" style={{ overflowX: 'hidden', maxWidth: '100%' }}>
      <head>
        <meta name="theme-color" content="#1f2b44" />
      </head>
      <body style={{
        margin: 0,
        padding: 0,
        overflowX: 'hidden',
        maxWidth: '100%',
      }}>
        {children}
      </body>
    </html>
  )
}

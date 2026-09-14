import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'WEB BOQ — สาขาวิชาวิศวกรรมโยธา มทร.อีสาน วิทยาเขตขอนแก่น',
  description: 'ระบบถอดปริมาณวัสดุ ประมาณราคา BOQ และ Factor F',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}

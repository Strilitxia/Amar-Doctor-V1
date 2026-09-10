import "./globals.css";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";

export const metadata = {
  title: "আমার ডাক্তার — Amar Doctor | AI-Powered Telemedicine",
  description:
    "Free AI-powered telemedicine platform for rural Bangladesh. Get instant medical consultations, prescription analysis, offline first aid, and a live map of ongoing and upcoming NGO medical camps — all in Bengali and English.",
  keywords: [
    "telemedicine",
    "AI doctor",
    "Bangladesh healthcare",
    "prescription scanner",
    "medical camp finder",
    "NGO health camp Bangladesh",
    "free eye camp",
    "hospital finder",
    "offline first aid",
    "আমার ডাক্তার",
  ],
  manifest: "/manifest.json",
};

export const viewport = {
  themeColor: "#17202e",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="bn">
      <head>
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body>
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}

